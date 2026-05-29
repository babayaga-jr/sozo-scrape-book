// Z-Library provider — https://z-library.sk
// Book library aggregator for Sozo Read.
//
// Z-Library protects every request with a SHA1 proof-of-work challenge.
// This scraper solves it inline (pure ES5 SHA1 + PoW loop) and replays
// the c_token cookie so subsequent requests return real content.
//
// NOTE: Z-Library rotates domains. Change SITE below if the mirror
// changes. Known mirrors: z-library.sk

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
    version: '1.1.0'
  };
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
// Minimal SHA1 (pure ES5, no DOM) — needed for the anti-bot PoW.
// ======================================================================
function _sha1Bytes(str) {
  var msg = [];
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c < 0x80) {
      msg.push(c);
    } else if (c < 0x800) {
      msg.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else {
      msg.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
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

    var a = H0, b = H1, c = H2, d = H3, e = H4;
    for (var j = 0; j < 80; j++) {
      var f, k;
      if (j < 20) { f = (b & c) | ((~b) & d); k = 0x5A827999; }
      else if (j < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
      else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
      else { f = b ^ c ^ d; k = 0xCA62C1D6; }
      var temp = (((a << 5) | (a >>> 27)) >>> 0) + f + e + k + w[j];
      e = d; d = c; c = ((b << 30) | (b >>> 2)) >>> 0; b = a; a = temp >>> 0;
    }
    H0 = (H0 + a) >>> 0; H1 = (H1 + b) >>> 0; H2 = (H2 + c) >>> 0;
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
// Solve Z-Library's SHA1 proof-of-work challenge.
// The 503 page embeds a 40-hex-char challenge string.  We append an
// integer nonce, compute SHA1, and check two specific digest bytes.
// When found we build the c_token cookie value.
// ======================================================================
function _extractChallenge(html) {
  var m = html.match(/=['"]([A-Fa-f0-9]{40})['"]/);
  return m ? m[1].toUpperCase() : null;
}

function _solvePow(challenge) {
  var n1 = parseInt('0x' + challenge.charAt(0), 16);
  var nonce = 0;
  while (nonce < 5000000) {
    var digest = _sha1Bytes(challenge + nonce);
    if (digest[n1] === 0xb0 && digest[n1 + 1] === 0x0b) {
      return challenge + nonce;
    }
    nonce++;
  }
  return null;
}

// ======================================================================
// Session management — solve the PoW once, cache the cookie.
// ======================================================================
function _parseCookies(headers) {
  var cookieStr = '';
  if (!headers) return cookieStr;
  if (typeof headers === 'string') {
    var m = headers.match(/bsrv=[^;]+/i);
    return m ? m[0] : '';
  }
  if (typeof headers === 'object') {
    var sc = headers['set-cookie'] || headers['Set-Cookie'] || '';
    if (Array.isArray(sc)) sc = sc.join('; ');
    var m = sc.match(/bsrv=[^;]+/i);
    return m ? m[0] : '';
  }
  return cookieStr;
}

function _ensureSession() {
  if (_sessionCookie) return Promise.resolve(_sessionCookie);

  return fetch(SITE + '/', {
    headers: { 'Referer': REFERER }
  }).then(function(r) {
    var html = r.body || '';
    var bsrv = _parseCookies(r.headers);

    var challenge = _extractChallenge(html);
    if (!challenge) {
      if (r.status === 200 && html.indexOf('searchResultBox') !== -1) {
        _sessionCookie = bsrv;
        return _sessionCookie;
      }
      console.log('zlibrary: no challenge found, status=' + r.status);
      return '';
    }

    console.log('zlibrary: solving PoW challenge=' + challenge);
    var token = _solvePow(challenge);
    if (!token) {
      console.log('zlibrary: PoW solve failed');
      return '';
    }

    var parts = [];
    if (bsrv) parts.push(bsrv);
    parts.push('c_token=' + token);
    parts.push('c_time=1');
    _sessionCookie = parts.join('; ');
    console.log('zlibrary: session established');
    return _sessionCookie;
  });
}

function _fetch(url) {
  return _ensureSession().then(function(cookie) {
    var headers = { 'Referer': REFERER };
    if (cookie) headers['Cookie'] = cookie;
    return fetch(url, { headers: headers });
  });
}

// ======================================================================
// Provider functions
// ======================================================================

function search(query, page, opts) {
  page = page || 1;
  opts = opts || {};
  var hasQuery = query && String(query).trim().length > 0;
  if (!hasQuery) return [];

  var url = SITE + '/s/' + encodeURIComponent(String(query).trim()) + '?page=' + page;
  console.log('zlibrary search url: ' + url);

  return _fetch(url).then(function(r) {
    if (r.status !== 200) {
      console.log('zlibrary search HTTP ' + r.status + ', retrying session');
      _sessionCookie = '';
      return [];
    }
    var html = r.body || '';

    var notFound = html.match(/<div[^>]+class="[^"]*notFound[^"]*"/i);
    if (notFound) return [];

    var results = [];
    var seen = {};

    var cardRe = /<z-bookcard\b([^>]*)>([\s\S]*?)<\/z-bookcard>/gi;
    var cards = _allMatches(html, cardRe);

    if (cards.length === 0) {
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
      console.log('zlibrary search count (fallback): ' + results.length);
      return results;
    }

    for (var i = 0; i < cards.length; i++) {
      var attrs = cards[i][1];
      var inner = cards[i][2];

      var href = _getAttr(attrs, 'href');
      if (!href) continue;
      var link = absUrl(href, SITE);
      if (seen[link]) continue;
      seen[link] = true;

      var titleSlot = inner.match(/<div[^>]+slot="title"[^>]*>([\s\S]*?)<\/div>/i);
      var title = titleSlot ? _cleanText(titleSlot[1]) : '';

      var authorSlot = inner.match(/<div[^>]+slot="author"[^>]*>([\s\S]*?)<\/div>/i);
      var authorRaw = authorSlot ? _cleanText(authorSlot[1]) : '';

      var extension = _getAttr(attrs, 'extension');
      var size = _getAttr(attrs, 'filesize');
      var lang = _getAttr(attrs, 'language');
      var year = _getAttr(attrs, 'year');

      var coverM = inner.match(/<img[^>]+data-src="([^"]+)"/i) ||
                   inner.match(/<img[^>]+src="([^"]+)"/i);
      var cover = coverM ? absUrl(coverM[1], SITE) : null;

      var displayTitle = title;
      if (extension) displayTitle = displayTitle + ' [' + extension.toUpperCase() + ']';
      if (authorRaw) displayTitle = displayTitle + ' — ' + authorRaw;

      results.push({
        id: _idFromUrl(link),
        title: displayTitle,
        cover: cover,
        url: link,
        type: 'novel'
      });
    }
    console.log('zlibrary search count: ' + results.length);
    return results;
  });
}

function _parseDetailProperty(html, prop) {
  var re = new RegExp(
    '<div[^>]+class="property_' + prop + '"[^>]*>([\\s\\S]*?)<\\/div>\\s*<\\/div>',
    'i'
  );
  var m = html.match(re);
  if (!m) return '';
  var valM = m[1].match(/<div[^>]+class="property_value"[^>]*>([\s\S]*?)<\/div>/i);
  return valM ? _cleanText(valM[1]) : _cleanText(m[1]);
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
  console.log('zlibrary detail url: ' + url);
  return _fetch(url).then(function(r) {
    if (r.status !== 200) {
      throw new Error('detail HTTP ' + r.status);
    }
    var html = r.body || '';

    var title = '';
    var zcoverM = html.match(/<z-cover\b([^>]*)>/i);
    if (zcoverM) {
      var titleAttr = zcoverM[1].match(/title="([\s\S]*?)"/i);
      if (titleAttr) title = _cleanText(titleAttr[1]);
    }
    if (!title) {
      var h1M = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      title = h1M ? _cleanText(h1M[1]) : '';
    }

    var coverM = html.match(/<img[^>]+class="image"[^>]+src="([^"]+)"/i);
    if (!coverM) coverM = html.match(/<z-cover[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/i);
    var cover = coverM ? absUrl(coverM[1], SITE) : null;

    var descM = html.match(/<div[^>]+id="bookDescriptionBox"[^>]*>([\s\S]*?)<\/div>/i);
    var description = descM ? _cleanText(descM[1]) : '';

    var colM = html.match(/<div[^>]+class="col-sm-9"[^>]*>([\s\S]*?)<\/div>/i);
    var authors = colM ? _parseLinks(colM[1]) : [];

    var year = _parseDetailProperty(html, 'year');
    var publisher = _parseDetailProperty(html, 'publisher');
    var language = _parseDetailProperty(html, 'language');
    var edition = _parseDetailProperty(html, 'edition');

    var fileProp = _parseDetailProperty(html, '_file');
    var extension = '';
    var fileSize = '';
    if (fileProp) {
      var fileParts = fileProp.split(',');
      if (fileParts.length >= 1) extension = fileParts[0].replace(/\s+/g, ' ').trim().toUpperCase();
      if (fileParts.length >= 2) fileSize = fileParts[1].trim();
    }

    var categories = _parseDetailProperty(html, 'categories');

    var downloadM = html.match(/<a[^>]+class="btn btn-default addDownloadedBook"[^>]+href="([^"]+)"/i);
    var downloadUrl = downloadM ? absUrl(downloadM[1], SITE) : '';

    var extraInfo = [];
    if (extension) extraInfo.push(extension);
    if (fileSize) extraInfo.push(fileSize);
    if (language) extraInfo.push(language);
    if (year) extraInfo.push(year);
    if (publisher) extraInfo.push('Publisher: ' + publisher);
    if (downloadUrl && downloadUrl.indexOf('unavailable') === -1) {
      extraInfo.push('Download: ' + downloadUrl);
    }

    if (extraInfo.length > 0 && description) {
      description = description + '\n\n---\n' + extraInfo.join(' | ');
    } else if (extraInfo.length > 0 && !description) {
      description = extraInfo.join(' | ');
    }

    var chapters = [];
    chapters.push({
      id: _idFromUrl(url) + '__full',
      title: title + (extension ? ' (' + extension + ')' : ''),
      number: 1,
      url: url,
      date: year || ''
    });

    console.log('zlibrary detail: title=' + title + ' authors=' + authors.join(', '));
    return {
      id: _idFromUrl(url),
      sourceId: SOURCE_ID,
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
  console.log('zlibrary chapter content url: ' + chapterUrl);
  return _fetch(chapterUrl).then(function(r) {
    if (r.status !== 200) return { text: '', nextUrl: '' };
    var html = r.body || '';

    var title = '';
    var zcoverM = html.match(/<z-cover\b([^>]*)>/i);
    if (zcoverM) {
      var titleAttr = zcoverM[1].match(/title="([\s\S]*?)"/i);
      if (titleAttr) title = _cleanText(titleAttr[1]);
    }

    var descM = html.match(/<div[^>]+id="bookDescriptionBox"[^>]*>([\s\S]*?)<\/div>/i);
    var content = descM ? _cleanText(descM[1]) : '';

    var downloadM = html.match(/<a[^>]+class="btn btn-default addDownloadedBook"[^>]+href="([^"]+)"/i);
    var downloadUrl = downloadM ? absUrl(downloadM[1], SITE) : '';

    if (downloadUrl && content) {
      content = content + '\n\n---\nDownload: ' + downloadUrl;
    } else if (downloadUrl && !content) {
      content = 'Download: ' + downloadUrl;
    }

    return { text: title + '\n\n' + content, nextUrl: '' };
  });
}
