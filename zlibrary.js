// Z-Library provider — https://z-library.sk
// Book library aggregator for Sozo Read.
//
// SETUP (required): Z-Library requires authentication.
//   1. Open z-library.sk in your phone browser and log in
//   2. Copy your browser cookies (use a "Copy Cookies" extension or
//      export from browser dev tools)
//   3. In Sozo Read → Settings → Sources → tap Z-Library → paste
//      cookies into the "Session Cookies" field
//   4. The cookies must include: remix_userkey, remix_userid
//
// Without cookies, the provider attempts an automatic challenge bypass
// which may not work reliably due to Z-Library's anti-bot protection.

var SOURCE_ID = 'zlibrary';
var SITE = 'https://z-library.sk';
var REFERER = SITE + '/';

var _sessionCookie = '';

function getInfo() {
  return {
    name: 'Z-Library',
    lang: 'en',
    baseUrl: SITE,
    logo: SITE + '/favicon.ico',
    type: 'novel',
    version: '1.3.0'
  };
}

function getSettings() {
  return [
    {
      key: 'cookie',
      label: 'Session Cookies — Log into z-library.sk in your browser, then copy all cookies and paste here',
      type: 'text',
      default: ''
    }
  ];
}

function _cleanText(s) {
  return htmlText(s || '').replace(/\s+/g, ' ').trim();
}

function _allMatches(html, regex) {
  var out = [];
  var m;
  regex.lastIndex = 0;
  while ((m = regex.exec(html)) !== null) {
    out.push(m);
    if (m.index === regex.lastIndex) regex.lastIndex++;
  }
  return out;
}

function _idFromUrl(url) {
  var m = String(url).match(/\/book\/(\d+)/);
  return m ? m[1] : String(url).replace(/[^a-zA-Z0-9]/g, '');
}

function _getAttr(tag, name) {
  if (!tag) return '';
  var re = new RegExp(name + '="([^"]*)"', 'i');
  var m = tag.match(re);
  return m ? _cleanText(m[1]) : '';
}

// ======================================================================
// Minimal SHA1 (pure ES5) — for anti-bot PoW fallback.
// ======================================================================
function _sha1Bytes(str) {
  var msg = [];
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c < 0x80) msg.push(c);
    else if (c < 0x800) msg.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else msg.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  var len = msg.length;
  msg.push(0x80);
  while (msg.length % 64 !== 56) msg.push(0);
  var bitLenHi = Math.floor(len / 536870912);
  var bitLenLo = (len << 3) >>> 0;
  msg.push(
    (bitLenHi >> 24) & 0xff, (bitLenHi >> 16) & 0xff,
    (bitLenHi >> 8) & 0xff, bitLenHi & 0xff,
    (bitLenLo >> 24) & 0xff, (bitLenLo >> 16) & 0xff,
    (bitLenLo >> 8) & 0xff, bitLenLo & 0xff
  );
  var H0 = 0x67452301, H1 = 0xEFCDAB89, H2 = 0x98BADCFE, H3 = 0x10325476, H4 = 0xC3D2E1F0;
  for (var offset = 0; offset < msg.length; offset += 64) {
    var w = [];
    for (var j = 0; j < 16; j++) {
      w[j] = (msg[offset + j * 4] << 24) | (msg[offset + j * 4 + 1] << 16) |
             (msg[offset + j * 4 + 2] << 8) | msg[offset + j * 4 + 3];
    }
    for (var j = 16; j < 80; j++) {
      var n = w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16];
      w[j] = ((n << 1) | (n >>> 31)) >>> 0;
    }
    var a = H0, b = H1, cc = H2, d = H3, e = H4;
    for (var j = 0; j < 80; j++) {
      var f, k;
      if (j < 20) { f = (b & cc) | ((~b) & d); k = 0x5A827999; }
      else if (j < 40) { f = b ^ cc ^ d; k = 0x6ED9EBA1; }
      else if (j < 60) { f = (b & cc) | (b & d) | (cc & d); k = 0x8F1BBCDC; }
      else { f = b ^ cc ^ d; k = 0xCA62C1D6; }
      var temp = (((a << 5) | (a >>> 27)) >>> 0) + f + e + k + w[j];
      e = d; d = cc; cc = ((b << 30) | (b >>> 2)) >>> 0; b = a; a = temp >>> 0;
    }
    H0 = (H0 + a) >>> 0; H1 = (H1 + b) >>> 0; H2 = (H2 + cc) >>> 0;
    H3 = (H3 + d) >>> 0; H4 = (H4 + e) >>> 0;
  }
  return [
    (H0 >> 24) & 0xff, (H0 >> 16) & 0xff, (H0 >> 8) & 0xff, H0 & 0xff,
    (H1 >> 24) & 0xff, (H1 >> 16) & 0xff, (H1 >> 8) & 0xff, H1 & 0xff,
    (H2 >> 24) & 0xff, (H2 >> 16) & 0xff, (H2 >> 8) & 0xff, H2 & 0xff,
    (H3 >> 24) & 0xff, (H3 >> 16) & 0xff, (H3 >> 8) & 0xff, H3 & 0xff,
    (H4 >> 24) & 0xff, (H4 >> 16) & 0xff, (H4 >> 8) & 0xff, H4 & 0xff
  ];
}

// ======================================================================
// Session management
// ======================================================================
function _getUserCookie() {
  try {
    var s = globalThis.__settings || {};
    var cfg = s[__SOURCE_ID] || {};
    var raw = (cfg.cookie || '').trim();
    if (raw.length > 10) return raw;
  } catch (e) {}
  return '';
}

function _extractChallenge(html) {
  var m = html.match(/=['"]([A-Fa-f0-9]{40})['"]/);
  return m ? m[1].toUpperCase() : null;
}

function _solvePow(challenge) {
  var n1 = parseInt('0x' + challenge.charAt(0), 16);
  for (var nonce = 0; nonce < 2000000; nonce++) {
    var d = _sha1Bytes(challenge + nonce);
    if (d[n1] === 0xb0 && d[n1 + 1] === 0x0b) return challenge + nonce;
  }
  return null;
}

function _parseSetCookie(headers) {
  if (!headers) return '';
  if (typeof headers === 'object') {
    var sc = headers['set-cookie'] || '';
    if (Array.isArray(sc)) sc = sc.join('; ');
    var m = String(sc).match(/bsrv=[^;]+/i);
    return m ? m[0] : '';
  }
  var m = String(headers).match(/bsrv=[^;]+/i);
  return m ? m[0] : '';
}

function _solveAndBuild() {
  return fetch(SITE + '/', {
    headers: { 'Referer': REFERER }
  }).then(function(r) {
    var html = r.body || '';
    var bsrv = _parseSetCookie(r.headers);

    if (r.status === 200 && html.indexOf('Checking your browser') === -1) {
      return bsrv;
    }

    var challenge = _extractChallenge(html);
    if (!challenge) {
      console.log('zlibrary: no challenge, status=' + r.status);
      return bsrv;
    }

    console.log('zlibrary: solving PoW');
    var token = _solvePow(challenge);
    if (!token) {
      console.log('zlibrary: PoW failed');
      return bsrv;
    }

    var parts = [];
    if (bsrv) parts.push(bsrv);
    parts.push('c_token=' + token);
    parts.push('c_time=1');
    console.log('zlibrary: PoW solved');
    return parts.join('; ');
  });
}

function _buildFullCookie(powCookie) {
  var userCookie = _getUserCookie();
  if (powCookie && userCookie) return powCookie + '; ' + userCookie;
  if (userCookie) return userCookie;
  if (powCookie) return powCookie;
  return '';
}

function _ensureSession() {
  if (_sessionCookie) return Promise.resolve(_sessionCookie);
  return _solveAndBuild().then(function(powCookie) {
    var full = _buildFullCookie(powCookie);
    _sessionCookie = full;
    return full;
  });
}

function _zfetch(url) {
  return _ensureSession().then(function(cookie) {
    var headers = { 'Referer': REFERER };
    if (cookie) headers['Cookie'] = cookie;
    return fetch(url, { headers: headers }).then(function(r) {
      if (r.body && r.body.indexOf('Checking your browser') !== -1) {
        console.log('zlibrary: session expired, re-solving');
        _sessionCookie = '';
      }
      return r;
    });
  });
}

// ======================================================================
// Search
// ======================================================================
function search(query, page, category) {
  page = page || 1;
  category = category || '';
  var q = query && String(query).trim();
  if (!q) return [];

  var url = SITE + '/s/' + encodeURIComponent(q) + '?page=' + page;
  console.log('zlibrary search: ' + url);

  return _zfetch(url).then(function(r) {
    if (r.status !== 200) {
      console.log('zlibrary search HTTP ' + r.status);
      _sessionCookie = '';
      return [];
    }
    var html = r.body || '';

    if (html.indexOf('Checking your browser') !== -1) {
      console.log('zlibrary: got challenge page, session expired');
      _sessionCookie = '';
      return [];
    }

    var notFound = html.match(/class="[^"]*notFound[^"]*"/i);
    if (notFound) return [];

    var results = [];
    var seen = {};

    var cardRe = /<z-bookcard\b([^>]*)>([\s\S]*?)<\/z-bookcard>/gi;
    var cards = _allMatches(html, cardRe);

    for (var i = 0; i < cards.length; i++) {
      var attrs = cards[i][1];
      var inner = cards[i][2];

      var href = _getAttr(attrs, 'href');
      if (!href) continue;
      var link = absUrl(href, SITE);
      if (seen[link]) continue;
      seen[link] = true;

      var titleSlot = inner.match(/slot="title"[^>]*>([\s\S]*?)<\/div>/i);
      var title = titleSlot ? _cleanText(titleSlot[1]) : '';
      if (!title) continue;

      var authorSlot = inner.match(/slot="author"[^>]*>([\s\S]*?)<\/div>/i);
      var author = authorSlot ? _cleanText(authorSlot[1]) : '';

      var ext = _getAttr(attrs, 'extension');
      var coverM = inner.match(/data-src="([^"]+)"/i) || inner.match(/src="([^"]+)"/i);
      var cover = coverM ? absUrl(coverM[1], SITE) : null;

      var displayTitle = title;
      if (ext) displayTitle = displayTitle + ' [' + ext.toUpperCase() + ']';
      if (author) displayTitle = displayTitle + ' - ' + author;

      results.push({
        id: _idFromUrl(link),
        title: displayTitle,
        cover: cover,
        url: link,
        type: 'novel'
      });
    }

    if (results.length === 0) {
      var fallbackRe = /<a[^>]+href="(\/book\/\d+\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      var fms = _allMatches(html, fallbackRe);
      for (var fi = 0; fi < fms.length; fi++) {
        var fLink = absUrl(fms[fi][1], SITE);
        if (seen[fLink]) continue;
        seen[fLink] = true;
        var fTitle = _cleanText(fms[fi][2]);
        if (!fTitle || fTitle.length < 2) continue;
        results.push({
          id: _idFromUrl(fLink),
          title: fTitle,
          cover: null,
          url: fLink,
          type: 'novel'
        });
      }
    }

    console.log('zlibrary search count: ' + results.length);
    return results;
  });
}

// ======================================================================
// Detail
// ======================================================================
function _parseProp(html, prop) {
  var re = new RegExp(
    'class="property_' + prop + '"[^>]*>([\\s\\S]*?)</div>\\s*</div>', 'i'
  );
  var m = html.match(re);
  if (!m) return '';
  var v = m[1].match(/class="property_value"[^>]*>([\s\S]*?)<\/div>/i);
  return v ? _cleanText(v[1]) : _cleanText(m[1]);
}

function _parseLinks(chunk) {
  var out = [];
  var re = /<a[^>]*>([^<]+)<\/a>/g;
  var m;
  while ((m = re.exec(chunk)) !== null) {
    var v = _cleanText(m[1]);
    if (v && out.indexOf(v) === -1) out.push(v);
  }
  if (out.length === 0) {
    var plain = _cleanText(chunk);
    if (plain) out.push(plain);
  }
  return out;
}

function getDetail(url) {
  console.log('zlibrary detail: ' + url);
  return _zfetch(url).then(function(r) {
    if (r.status !== 200) throw new Error('detail HTTP ' + r.status);
    var html = r.body || '';

    var title = '';
    var zcoverM = html.match(/<z-cover\b([^>]*)>/i);
    if (zcoverM) {
      var ta = zcoverM[1].match(/title="([\s\S]*?)"/i);
      if (ta) title = _cleanText(ta[1]);
    }
    if (!title) {
      var h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      title = h1 ? _cleanText(h1[1]) : 'Unknown';
    }

    var coverM = html.match(/class="image"[^>]+src="([^"]+)"/i) ||
                 html.match(/<z-cover[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/i);
    var cover = coverM ? absUrl(coverM[1], SITE) : null;

    var descM = html.match(/id="bookDescriptionBox"[^>]*>([\s\S]*?)<\/div>/i);
    var description = descM ? _cleanText(descM[1]) : '';

    var colM = html.match(/class="col-sm-9"[^>]*>([\s\S]*?)<\/div>/i);
    var authors = colM ? _parseLinks(colM[1]) : [];

    var year = _parseProp(html, 'year');
    var publisher = _parseProp(html, 'publisher');
    var language = _parseProp(html, 'language');

    var fileProp = _parseProp(html, '_file');
    var extension = '';
    var fileSize = '';
    if (fileProp) {
      var fp = fileProp.split(',');
      extension = fp[0].trim().toUpperCase();
      if (fp.length >= 2) fileSize = fp[1].trim();
    }

    var categories = _parseProp(html, 'categories');

    var dlM = html.match(/class="btn btn-default addDownloadedBook"[^>]+href="([^"]+)"/i);
    var downloadUrl = dlM ? absUrl(dlM[1], SITE) : '';

    var extra = [];
    if (extension) extra.push(extension);
    if (fileSize) extra.push(fileSize);
    if (language) extra.push(language);
    if (year) extra.push(year);
    if (publisher) extra.push('Publisher: ' + publisher);
    if (downloadUrl && downloadUrl.indexOf('unavailable') === -1) {
      extra.push('Download: ' + downloadUrl);
    }
    if (extra.length > 0) {
      description = description ? description + '\n\n---\n' + extra.join(' | ') : extra.join(' | ');
    }

    var chapters = [];
    chapters.push({
      id: _idFromUrl(url) + '__full',
      title: title + (extension ? ' (' + extension + ')' : ''),
      number: 1,
      url: url,
      date: year || ''
    });

    console.log('zlibrary detail: ' + title);
    return {
      id: _idFromUrl(url),
      title: title,
      cover: cover,
      url: url,
      description: description,
      status: 'completed',
      genres: categories ? [categories] : [],
      authors: authors,
      chapters: chapters,
      type: 'novel'
    };
  });
}

function getChapters(url) {
  return [];
}

function getPages(chapterUrl) {
  return [];
}

function getChapterContent(chapterUrl) {
  console.log('zlibrary content: ' + chapterUrl);
  return _zfetch(chapterUrl).then(function(r) {
    if (r.status !== 200) return { text: 'Failed to load content.', nextUrl: null };

    var html = r.body || '';

    var title = '';
    var zcoverM = html.match(/<z-cover\b([^>]*)>/i);
    if (zcoverM) {
      var ta = zcoverM[1].match(/title="([\s\S]*?)"/i);
      if (ta) title = _cleanText(ta[1]);
    }

    var descM = html.match(/id="bookDescriptionBox"[^>]*>([\s\S]*?)<\/div>/i);
    var desc = descM ? _cleanText(descM[1]) : '';

    var dlM = html.match(/class="btn btn-default addDownloadedBook"[^>]+href="([^"]+)"/i);
    var dlUrl = dlM ? absUrl(dlM[1], SITE) : '';

    var parts = [];
    if (title) parts.push(title);
    if (desc) parts.push(desc);
    if (dlUrl && dlUrl.indexOf('unavailable') === -1) parts.push('Download: ' + dlUrl);

    var text = parts.length > 0 ? parts.join('\n\n') : 'No content available.';
    return { text: text, nextUrl: null };
  });
}
