"""Opt-in cashier middleware. No polling, global commands, or store changes."""
import asyncio
import io
import os
import html
import re
import secrets
import sqlite3
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path
from urllib.parse import urlparse

PILOT_IDS = {163665735, 7845375334}
# Режим учёта: pilot – тестовый журнал, live – рабочий. Должен совпадать с DC_LOYALTY_MODE на сервере API.
MODE = os.getenv('DC_LOYALTY_MODE', 'pilot') if os.getenv('DC_LOYALTY_MODE', 'pilot') in {'pilot', 'live'} else 'pilot'
LIVE = MODE == 'live'
# Кассиры: в рабочем режиме – DC_CASHIER_IDS (через запятую), иначе тестовые аккаунты.
CASHIER_IDS = {int(x) for x in os.getenv('DC_CASHIER_IDS', '').replace(' ', '').split(',') if x.isdigit()} if LIVE else PILOT_IDS
T = '' if LIVE else 'ТЕСТ '
# Владелец клуба управляет сотрудниками магазина (/shop). Сотрудник – только касса и уведомления, не админ бота.
OWNER_IDS = {int(x) for x in os.getenv('DC_OWNER_IDS', '163665735').replace(' ', '').split(',') if x.isdigit()}
SHOP_INVITE = re.compile(r'shop_([a-z0-9]{8,24})')
CARD = re.compile(r"dc1_\d{1,16}_[A-Za-z0-9_-]{28}")


def parse_amount(text):
    text = text.strip().replace(',', '.')
    if not re.fullmatch(r'\d{1,7}(?:\.\d{1,2})?', text):
        raise ValueError('amount')
    try:
        value = int(Decimal(text) * 100)
    except InvalidOperation as exc:
        raise ValueError('amount') from exc
    if not 0 < value <= 100000000:
        raise ValueError('amount')
    return value


def money(value):
    return f'{value // 100:,}.{value % 100:02d}'.replace(',', ' ').replace('.', ',') + ' ₽'


def card_from_text(text):
    text = text.strip()
    if CARD.fullmatch(text):
        return text
    if text.startswith('/start '):
        text = text.split(maxsplit=1)[1]
        return text if CARD.fullmatch(text) else None
    if text.startswith('https://t.me/yaltahiking_bot?start='):
        text = text.split('start=', 1)[1]
        return text if CARD.fullmatch(text) else None
    return None


class Sessions:
    def __init__(self, filename):
        self.filename = str(filename)
        Path(filename).parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(self.filename, os.O_CREAT | os.O_RDWR, 0o600)
        os.close(fd)
        os.chmod(self.filename, 0o600)
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS cashier (actor INTEGER PRIMARY KEY, card TEXT, ref TEXT, gross INTEGER, stage TEXT NOT NULL)')

    def connect(self):
        return sqlite3.connect(self.filename, timeout=3)

    def get(self, actor):
        with self.connect() as db:
            row = db.execute('SELECT card, ref, gross, stage FROM cashier WHERE actor=?', (actor,)).fetchone()
        return dict(zip(('card', 'ref', 'gross', 'stage'), row)) if row else None

    def put(self, actor, card=None, ref=None, gross=None, stage='scan'):
        with self.connect() as db:
            db.execute('INSERT OR REPLACE INTO cashier VALUES (?, ?, ?, ?, ?)', (actor, card, ref, gross, stage))

    def clear(self, actor):
        with self.connect() as db:
            db.execute('DELETE FROM cashier WHERE actor=?', (actor,))


class ApiError(Exception):
    pass


class Api:
    def __init__(self, url, key):
        parsed = urlparse(url)
        if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError('DC_LOYALTY_URL must be an HTTPS endpoint')
        self.url, self.key = url, key

    async def call(self, action, actor, **kwargs):
        import aiohttp
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=20)) as client:
                async with client.post(self.url, json={'action': action, 'actor': str(actor), 'mode': MODE, **kwargs},
                                       headers={'x-dc-bot-key': self.key}, allow_redirects=False) as response:
                    if response.content_length and response.content_length > 16384:
                        raise ApiError('service_unavailable')
                    result = await response.json()
                    if response.status != 200:
                        code = result.get('error', 'service_unavailable')
                        raise ApiError(code if re.fullmatch(r'[a-z_]{1,64}', str(code)) else 'service_unavailable')
                    if result.get('mode') != MODE:
                        raise ApiError('pilot_mode_required')
                    return result
        except ApiError:
            raise
        except Exception as exc:
            raise ApiError('connection_unconfirmed') from exc


ERRORS = {
    'inactive_card': 'Карта неактивна. Покупку не подтверждаем.',
    'pilot_card_only': 'Пока доступны только две тестовые карты.',
    'reservation_expired': 'Расчёт устарел. Нажми «Отменить», затем введи сумму заново.',
    'month_changed': 'Начался новый месяц. Нажми «Отменить» и рассчитай сумму заново.',
    'cashier_forbidden': 'Кассовый режим для этого аккаунта не разрешён.',
    'operation_closed': 'Операция уже закрыта. Нажми «Отменить», затем начни новую покупку.',
    'pilot_mode_required': 'Режим учёта бота и сервера не совпадает. Покупку не подтверждаем.',
}


class Cashier:
    def __init__(self, api, sessions):
        self.api, self.sessions = api, sessions
        self.locks = {}
        self.staff, self.staff_at = set(), 0.0

    async def is_cashier(self, actor):
        if actor in CASHIER_IDS:
            return True
        import time
        if time.monotonic() - self.staff_at > 60:
            try:
                result = await self.api.call('staff_ids', actor)
                self.staff = {int(x) for x in result.get('ids', []) if str(x).isdigit()}
            except Exception:
                pass  # остаётся прежний список
            self.staff_at = time.monotonic()
        return actor in self.staff

    async def shop_admin(self, message, actor, callback_text=None):
        from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
        if callback_text:
            uid = callback_text.split(':')[2]
            await self.api.call('staff_remove', actor, uid=uid)
            self.staff_at = 0
        invite = await self.api.call('staff_invite', actor)
        members = (await self.api.call('staff_list', actor)).get('members') or {}
        link = f"https://t.me/yaltahiking_bot?start=shop_{invite['code']}"
        lines = ['<b>Сотрудники магазина «Жить здорово»</b>',
                 'Могут проверять QR карты на кассе (/cashier) и получают уведомления о заказах боксов. Админом бота не становятся.', '']
        lines += [f"• {html.escape((m or {}).get('name') or 'без имени')} · <code>{uid}</code>" for uid, m in members.items()] or ['пока никого']
        lines += ['', 'Ссылка для нового сотрудника (одноразовая, действует 7 дней):', link]
        kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text=f"убрать {(m or {}).get('name') or uid}", callback_data=f'dcs:r:{uid}')] for uid, m in members.items()])
        await message.answer('\n'.join(lines), parse_mode='HTML', reply_markup=kb if members else None, disable_web_page_preview=True)

    @staticmethod
    def keyboard(ref, retry=False):
        from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
        buttons = ([InlineKeyboardButton(text='Повторить расчёт', callback_data=f'dc:r:{ref}')] if retry else
                   [InlineKeyboardButton(text='Покупка оплачена — учесть', callback_data=f'dc:y:{ref}')])
        buttons.append(InlineKeyboardButton(text='Отменить', callback_data=f'dc:n:{ref}'))
        return InlineKeyboardMarkup(inline_keyboard=[[button] for button in buttons])

    async def quote(self, event, actor, pending):
        result = await self.api.call('reserve', actor, card=pending['card'], reference=pending['ref'], gross=pending['gross'])
        if result['state'] == 'confirmed':
            self.sessions.put(actor, card=pending['card'], stage='amount')
            await event.answer(T + 'Эта покупка уже учтена один раз. Можно ввести сумму следующей покупки.')
            return
        await event.answer(('' if LIVE else 'ТЕСТ — реальные покупки не учитываются\n\n') +
                           f"Сумма до скидки: {money(result['gross'])}\n"
                           f"Под 10%: {money(result['highGross'])}\n"
                           f"Под 5%: {money(result['lowGross'])}\n"
                           f"Скидка: {money(result['discount'])}\n"
                           f"К оплате: {money(result['payable'])}\n\n"
                           'Расчёт действует 10 минут. Подтверждай только после оплаты.',
                           reply_markup=self.keyboard(pending['ref']))

    async def __call__(self, handler, event, data):
        from aiogram.types import CallbackQuery
        callback = isinstance(event, CallbackQuery)
        text = (event.data or '') if callback else (event.text or '')
        actor = event.from_user.id if event.from_user else None
        message = event.message if callback else event
        if not message or message.chat.type != 'private' or not actor:
            return await handler(event, data)
        command = text.split(maxsplit=1)[0].split('@')[0] if text else ''
        token = None if callback else card_from_text(text)
        # Покупатель отвечает на вопрос «что сделать с боксом» после отмены участия в хайке
        box = re.fullmatch(r'dco:([cp]):(\d{4}-\d{2}-\d{2}):([\w-]{1,20})', text) if callback else None
        if box:
            try:
                result = await self.api.call('box_choice', actor, date=box[2], number=box[3], choice='cancel' if box[1] == 'c' else 'pickup')
                await event.answer()
                try:
                    await message.edit_reply_markup(reply_markup=None)
                except Exception:
                    pass
                await message.answer('Передали магазину: заказ отменят и вернут деньги – придёт сообщение, когда отменят.' if result.get('choice') == 'cancel'
                                     else 'Передали магазину: бокс на хайк не везём, заберёшь его сам в магазине «Жить здорово» в часы работы.')
            except ApiError as error:
                await event.answer('Отменить уже нельзя – бокс собирают. Его можно забрать в магазине.' if str(error) == 'too_late' else 'Не получилось. Напиши организатору клуба.', show_alert=True)
            return
        invite = None if callback else SHOP_INVITE.fullmatch(text.split(maxsplit=1)[1]) if text.startswith('/start ') and len(text.split()) == 2 else None
        if invite:
            try:
                name = ' '.join(x for x in [event.from_user.first_name, event.from_user.last_name] if x)
                await self.api.call('staff_join', actor, code=invite[1], name=name)
                self.staff_at = 0
                await message.answer('Готово – ты сотрудник магазина «Жить здорово» в боте клуба.\n\n'
                                     '• /cashier – касса: наведи камеру на QR карты интеллигента, бот посчитает скидку\n'
                                     '• уведомления о заказах хайкинг боксов будут приходить сюда автоматически\n'
                                     '• /cashier_exit – выйти из кассы')
            except ApiError as error:
                await message.answer('Ссылка устарела или уже использована. Попроси новую у организатора клуба.' if str(error) in {'invite_expired', 'invalid_code'} else 'Не получилось добавить. Попробуй ещё раз позже.')
            return
        if (command == '/shop' and not callback) or (callback and text.startswith('dcs:r:')):
            if actor not in OWNER_IDS:
                return await handler(event, data)
            if callback:
                await event.answer()
            try:
                await self.shop_admin(message, actor, text if callback else None)
            except ApiError:
                await message.answer('Не получилось загрузить список сотрудников. Попробуй позже.')
            return
        special = text.startswith('dc:') if callback else command in {'/cashier', '/cashier_exit', '/discount_card'} or token is not None
        # Обычные сообщения не-кассиров – сразу дальше, без запросов к серверу; список сотрудников сверяем только для кассовых действий.
        if not special and actor not in CASHIER_IDS and actor not in self.staff:
            return await handler(event, data)
        if not (actor in CASHIER_IDS or actor in self.staff or (special and await self.is_cashier(actor))):
            # Do not interfere with the bot's ordinary onboarding or support.
            if special:
                if callback:
                    await event.answer('Кассовый режим доступен только кассирам магазина.', show_alert=True)
                else:
                    await message.answer('Это QR карты интеллигента для кассы «Жить здорово». Его сканирует кассир магазина.')
                return
            return await handler(event, data)
        session = self.sessions.get(actor)
        # Ordinary commands always remain available; cashier messages are opt-in.
        if not special and (callback or not session or command.startswith('/')):
            return await handler(event, data)
        lock = self.locks.setdefault(actor, asyncio.Lock())
        async with lock:
            session = self.sessions.get(actor)
            if callback:
                await event.answer()
            try:
                if command == '/discount_card' and not callback:
                    result = await self.api.call('card', actor)
                    vendor = str(Path(__file__).with_name("dc_vendor"))
                    if vendor not in sys.path:
                        sys.path.insert(0, vendor)
                    import qrcode
                    from qrcode.image.pure import PyPNGImage
                    from aiogram.types import BufferedInputFile
                    image = qrcode.make(result['url'], image_factory=PyPNGImage)
                    output = io.BytesIO(); image.save(output)
                    await message.answer_photo(BufferedInputFile(output.getvalue(), filename='club-test-card.png'),
                                               caption=T + 'QR карты интеллигента для кассы «Жить здорово».\n' + result['url'])
                    return
                if command in {'/cashier', '/cashier_exit'} and not callback:
                    if session and session.get('ref'):
                        await message.answer('Сначала заверши или отмени текущий расчёт.', reply_markup=self.keyboard(session['ref'], retry=True))
                        return
                    if command == '/cashier_exit':
                        self.sessions.clear(actor)
                        await message.answer('Кассовый режим закрыт. Обычное меню бота работает как прежде.')
                    else:
                        self.sessions.put(actor)
                        await message.answer(('КАССА «ЖИТЬ ЗДОРОВО»' if LIVE else 'ТЕСТОВАЯ КАССА') + '\nОткрой QR карты камерой телефона или пришли ссылку на него сюда.\nВыход: /cashier_exit')
                    return
                if token and not callback:
                    if session and session.get('ref'):
                        await message.answer('Сначала заверши или отмени текущий расчёт.', reply_markup=self.keyboard(session['ref'], retry=True))
                        return
                    result = await self.api.call('status', actor, card=token)
                    self.sessions.put(actor, card=token, stage='amount')
                    await message.answer(T + 'Карта активна\n'
                                         f"Месяц: {result['month']}\n"
                                         f"Учтено до скидки: {money(result['usedGross'])}\n"
                                         f"Доступно под 10% с учётом резервов: {money(result['remainingGross'])}\n\n"
                                         'Введи сумму покупки ДО скидки в рублях, например 1250,50. Выход: /cashier_exit')
                    return
                if callback:
                    match = re.fullmatch(r'dc:([ryn]):([a-f0-9]{20})', text)
                    if not match or not session or session.get('ref') != match[2]:
                        await message.answer('Это старый расчёт. Текущий учёт не изменён.')
                        return
                    action = match[1]
                    if action == 'r':
                        await self.quote(message, actor, session)
                        return
                    result = await self.api.call('confirm' if action == 'y' else 'cancel', actor,
                                                 card=session['card'], reference=session['ref'])
                    self.sessions.put(actor, card=session['card'], stage='amount')
                    try:
                        await message.edit_reply_markup(reply_markup=None)
                    except Exception:
                        pass  # Accounting is already confirmed; an old keyboard is harmless.
                    await message.answer((T + 'Покупка учтена один раз.' if result['state'] == 'confirmed' else T + 'Расчёт отменён.') +
                                         '\nВведи сумму следующей покупки или /cashier_exit')
                    return
                if not session or session['stage'] == 'scan':
                    await message.answer('Пришли ссылку из QR карты. Фото считывай обычной камерой телефона. Выход: /cashier_exit')
                    return
                if session.get('ref'):
                    await message.answer('Текущий расчёт ещё не завершён. Повтор использует ту же операцию.', reply_markup=self.keyboard(session['ref'], retry=True))
                    return
                try:
                    gross = parse_amount(text)
                except ValueError:
                    await message.answer('Введи сумму в рублях, например 1250,50. Только число, не более двух знаков после запятой.')
                    return
                pending = {'card': session['card'], 'ref': secrets.token_hex(10), 'gross': gross, 'stage': 'pending'}
                self.sessions.put(actor, **pending)
                await self.quote(message, actor, pending)
            except ApiError as error:
                pending = self.sessions.get(actor)
                await message.answer(ERRORS.get(str(error), 'Результат запроса не подтверждён. Не создавай новую покупку: повтори ту же операцию кнопкой ниже.'),
                                     reply_markup=self.keyboard(pending['ref'], retry=True) if pending and pending.get('ref') else None)
            except Exception:
                # Do not log tokens, financial data or raw provider errors.
                await message.answer('Кассовый модуль временно недоступен. Учёт не подтверждён; не создавай новую покупку. Обычное меню: /start')


def install(dp):
    if os.getenv('DC_CASHIER_ENABLED') not in {'pilot', 'live'}:
        return False
    key = os.getenv('DC_CASHIER_BOT_KEY', '')
    if len(key) < 32:
        raise ValueError('DC_CASHIER_BOT_KEY is not configured')
    module = Cashier(Api(os.environ['DC_LOYALTY_URL'], key),
                     Sessions(os.getenv('DC_CASHIER_DB', '/opt/hiking_bot/dc-cashier-pilot.sqlite3')))
    dp.message.outer_middleware(module)
    dp.callback_query.outer_middleware(module)
    return True
