// Синхронизация листа «Маршруты» с Firebase Realtime Database.
// Добавь этот файл в Apps Script, привязанный к той же Google Таблице.
// Настройки хранятся в Script Properties, поэтому секреты не попадают в код.

var ROUTES_SHEET_NAME = 'Маршруты';
var ROUTES_FIREBASE_PATH = 'routes';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Маршруты')
    .addItem('Синхронизировать с приложением', 'syncRoutes')
    .addToUi();
}

function syncRoutes() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ROUTES_SHEET_NAME);
  if (!sheet) throw new Error('Не найден лист «' + ROUTES_SHEET_NAME + '».');

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) throw new Error('В листе «Маршруты» пока нет маршрутов.');
  var headers = values.shift().map(function(value) { return normaliseHeader_(value); });
  var columns = getRouteColumns_(headers);
  if (columns.title === -1 || columns.gpx === -1) {
    throw new Error('Нужны столбцы «Название» и «GPX-трек».');
  }

  var routes = {};
  var errors = [];
  values.forEach(function(row, index) {
    var rowNumber = index + 2;
    var title = asText_(row[columns.title]);
    if (!title || !isRouteActive_(columns.active === -1 ? '' : row[columns.active])) return;
    try {
      var gpxUrl = asText_(row[columns.gpx]);
      var track = parseGpx_(loadGpx_(gpxUrl));
      if (!track.segments.length) throw new Error('в GPX нет трека');
      var id = columns.id === -1 ? makeRouteId_(title) : makeRouteId_(asText_(row[columns.id]) || title);
      if (routes[id]) throw new Error('повторяющийся ID «' + id + '»');
      routes[id] = {
        id: id,
        title: title,
        description: columns.description === -1 ? '' : asText_(row[columns.description]),
        reportUrl: columns.report === -1 ? '' : asText_(row[columns.report]),
        gpxUrl: gpxUrl,
        order: columns.order === -1 ? rowNumber : numberOr_(row[columns.order], rowNumber),
        active: true,
        segments: track.segments,
        bounds: track.bounds,
        pointCount: track.pointCount,
        updatedAt: new Date().toISOString()
      };
    } catch (error) {
      errors.push('Строка ' + rowNumber + ' («' + title + '»): ' + error.message);
    }
  });

  if (errors.length) throw new Error('Синхронизация отменена.\n' + errors.join('\n'));
  if (!Object.keys(routes).length) throw new Error('Не найдено ни одного активного маршрута с GPX-треком.');

  putFirebase_(ROUTES_FIREBASE_PATH, routes);
  SpreadsheetApp.getActive().toast('Синхронизировано маршрутов: ' + Object.keys(routes).length, 'Маршруты', 6);
  Logger.log('Routes synced: ' + Object.keys(routes).length);
}

function getRouteColumns_(headers) {
  return {
    id: findHeader_(headers, ['id', 'ид']),
    title: findHeader_(headers, ['название', 'title']),
    description: findHeader_(headers, ['описание', 'description']),
    report: findHeader_(headers, ['ссылка на отчет', 'ссылка на отчёт', 'отчет', 'отчёт', 'report', 'report url']),
    gpx: findHeader_(headers, ['gpx трек', 'gpx-трек', 'gpx', 'трек', 'gpx url']),
    order: findHeader_(headers, ['порядок', 'order', 'позиция']),
    active: findHeader_(headers, ['активен', 'active', 'показывать'])
  };
}

function findHeader_(headers, names) {
  for (var i = 0; i < names.length; i++) {
    var index = headers.indexOf(normaliseHeader_(names[i]));
    if (index !== -1) return index;
  }
  return -1;
}

function normaliseHeader_(value) {
  return asText_(value).toLowerCase().replace(/[ё]/g, 'е').replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function asText_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function numberOr_(value, fallback) {
  var number = Number(value);
  return isFinite(number) ? number : fallback;
}

function isRouteActive_(value) {
  var normalised = asText_(value).toLowerCase();
  return !['нет', 'no', 'false', '0', 'скрыть'].includes(normalised);
}

function makeRouteId_(value) {
  var translit = { 'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ы':'y','э':'e','ю':'yu','я':'ya','ь':'','ъ':'' };
  return asText_(value).toLowerCase().replace(/ё/g, 'е').split('').map(function(char) { return translit[char] !== undefined ? translit[char] : char; }).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function loadGpx_(url) {
  if (!url) throw new Error('не указана ссылка на GPX');
  var id = url.match(/[-\w]{25,}/);
  if (id) return DriveApp.getFileById(id[0]).getBlob().getDataAsString('UTF-8');
  var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (response.getResponseCode() >= 300) throw new Error('не удалось скачать GPX (' + response.getResponseCode() + ')');
  return response.getContentText('UTF-8');
}

function parseGpx_(gpx) {
  var groups = gpx.match(/<trkseg\b[^>]*>[\s\S]*?<\/trkseg>/gi) || gpx.match(/<rte\b[^>]*>[\s\S]*?<\/rte>/gi) || [gpx];
  var segments = groups.map(parseGpxPoints_).filter(function(segment) { return segment.length > 1; });
  var points = [].concat.apply([], segments);
  if (!points.length) return { segments: [], bounds: [], pointCount: 0 };
  return {
    segments: segments,
    bounds: [
      [Math.min.apply(null, points.map(function(point) { return point[1]; })), Math.min.apply(null, points.map(function(point) { return point[0]; }))],
      [Math.max.apply(null, points.map(function(point) { return point[1]; })), Math.max.apply(null, points.map(function(point) { return point[0]; }))]
    ],
    pointCount: points.length
  };
}

function parseGpxPoints_(xml) {
  var tags = xml.match(/<(?:trkpt|rtept)\b[^>]*>/gi) || [];
  var points = tags.map(function(tag) {
    var lat = tag.match(/\blat=["']([^"']+)["']/i);
    var lon = tag.match(/\blon=["']([^"']+)["']/i);
    return lat && lon ? [Number(lat[1]), Number(lon[1])] : null;
  }).filter(function(point) { return point && isFinite(point[0]) && isFinite(point[1]); });
  // Avoid oversized Firebase payloads while preserving the full line shape.
  if (points.length <= 1600) return points;
  var step = Math.ceil(points.length / 1600);
  return points.filter(function(_, index) { return index % step === 0 || index === points.length - 1; });
}

function putFirebase_(path, data) {
  var props = PropertiesService.getScriptProperties();
  var baseUrl = asText_(props.getProperty('FIREBASE_DATABASE_URL')).replace(/\/$/, '');
  var authToken = asText_(props.getProperty('FIREBASE_AUTH_TOKEN'));
  if (!baseUrl) throw new Error('В Script Properties не задан FIREBASE_DATABASE_URL.');
  var url = baseUrl + '/' + path + '.json' + (authToken ? '?auth=' + encodeURIComponent(authToken) : '');
  var response = UrlFetchApp.fetch(url, {
    method: 'put',
    contentType: 'application/json',
    payload: JSON.stringify(data),
    muteHttpExceptions: true
  });
  if (response.getResponseCode() >= 300) throw new Error('Firebase вернул ' + response.getResponseCode() + ': ' + response.getContentText());
}
