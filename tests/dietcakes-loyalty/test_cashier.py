import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest

spec=importlib.util.spec_from_file_location('dc_cashier',Path(__file__).parents[2]/'integrations/telegram-bot/dc_cashier.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Callback: pass
class Button:
 def __init__(self,**kwargs):self.__dict__.update(kwargs)
sys.modules['aiogram']=types.ModuleType('aiogram')
sys.modules['aiogram.types']=types.SimpleNamespace(CallbackQuery=Callback,InlineKeyboardMarkup=Button,InlineKeyboardButton=Button)
class Message:
 def __init__(self,text,actor=163665735,chat='private'):
  self.text=text;self.from_user=types.SimpleNamespace(id=actor);self.chat=types.SimpleNamespace(type=chat);self.answers=[]
 async def answer(self,text,**kwargs):self.answers.append((text,kwargs))
 async def edit_reply_markup(self,**kwargs):pass
class FakeApi:
 def __init__(self):self.calls=[];self.fail=False
 async def call(self,action,actor,**kwargs):
  self.calls.append((action,actor,kwargs))
  if self.fail:raise m.ApiError('connection_unconfirmed')
  if action=='status':return {'mode':'pilot','month':'2026-10','usedGross':0,'remainingGross':1500000}
  return {'mode':'pilot','state':'confirmed' if action=='confirm' else 'cancelled' if action=='cancel' else 'reserved','gross':100000,'highGross':100000,'lowGross':0,'discount':10000,'payable':90000}
class CashierTests(unittest.IsolatedAsyncioTestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.file=Path(self.tmp.name)/'session.sqlite3';self.db=m.Sessions(self.file);self.api=FakeApi();self.module=m.Cashier(self.api,self.db);self.delegated=0
 async def handler(self,event,data):self.delegated+=1
 def tearDown(self):self.tmp.cleanup()
 async def send(self,text,actor=163665735):
  event=Message(text,actor);await self.module(self.handler,event,{});return event
 async def test_regular_messages_and_commands_preserved(self):
  await self.send('привет');await self.send('/start');await self.send('привет',123);self.assertEqual(self.delegated,3);self.assertEqual(self.api.calls,[])
 async def test_other_users_cannot_enter_pilot(self):
  await self.send('/cashier',123);self.assertEqual(self.api.calls,[]);self.assertIsNone(self.db.get(123))
 async def test_timeout_preserves_same_reference_after_restart(self):
  self.db.put(163665735,card='dc1_163665735_'+'x'*28,stage='amount');self.api.fail=True
  await self.send('1000');pending=self.db.get(163665735);self.assertTrue(pending['ref']);self.assertEqual(pending['gross'],100000)
  self.assertEqual(m.Sessions(self.file).get(163665735),pending)
  await self.send('1000');self.assertEqual(len(self.api.calls),1);self.assertEqual(self.db.get(163665735)['ref'],pending['ref'])
 async def test_card_flow_amount_quote_and_confirm_once(self):
  token='dc1_163665735_'+'x'*28
  await self.send('/start '+token);await self.send('1000');pending=self.db.get(163665735)
  callback=Callback();callback.data='dc:y:'+pending['ref'];callback.from_user=types.SimpleNamespace(id=163665735);callback.message=Message('quote')
  async def answer(*args,**kwargs):pass
  callback.answer=answer
  await self.module(self.handler,callback,{});await self.module(self.handler,callback,{})
  self.assertEqual([x[0] for x in self.api.calls],['status','reserve','confirm']);self.assertIsNone(self.db.get(163665735)['ref'])
 async def test_exit_preserves_unresolved_purchase(self):
  self.db.put(163665735,card='token',ref='a'*20,gross=100000,stage='pending');await self.send('/cashier_exit');self.assertIsNotNone(self.db.get(163665735))
 def test_amount_format_and_permissions(self):
  self.assertEqual(m.parse_amount('1250,50'),125050);self.assertEqual(m.parse_amount('0.01'),1)
  for text in ['-1','1.001','nan','1e3','0','1000001','1 000','1руб']:
   with self.assertRaises(ValueError):m.parse_amount(text)
  self.assertEqual(os.stat(self.file).st_mode&0o777,0o600)
 def test_disabled_install_is_inert(self):
  previous=os.environ.pop('DC_CASHIER_ENABLED',None)
  try:self.assertFalse(m.install(object()))
  finally:
   if previous is not None:os.environ['DC_CASHIER_ENABLED']=previous
if __name__=='__main__':unittest.main()
