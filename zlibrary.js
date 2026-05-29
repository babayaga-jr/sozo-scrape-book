// Z-Library provider — https://z-lib.org
// Book library aggregator. Type is set to 'novel' as the closest match
// within the Sozo Read provider contract. Search returns book results;
// getDetail returns full metadata; getChapterContent returns the book
// description since Z-Library serves whole-book downloads rather than
// chapter-based text.
//
// NOTE: Z-Library rotates domains frequently. Change SITE below to the
// current working mirror (e.g. singlelogin.re, zlibrary-global.se, etc.)
// before distributing.

var SOURCE_ID = 'zlibrary';
var SITE = 'https://singlelogin.re';
var REFERER = SITE + '/';

function getInfo() {
  return {
    name: 'Z-Library',
    lang: 'en',
    baseUrl: SITE,
    logo: SITE + '/favicon.ico',
    type: 'novel',
    version: '1.0.0'
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

function _normalizeStatus(s) {
  s = (s || '').toLowerCase();
  if (s.indexOf('ongoing') !== -1) return 'ongoing';
  if (s.indexOf('complete') !== -1 || s.indexOf('finished') !== -1) return 'completed';
  return 'unknown';
}

function search(query, page, opts) {
  page = page || 1;
  opts = opts || {};
  var hasQuery = query && String(query).trim().length > 0;
  if (!hasQuery) return [];

  var url = SITE + '/s/' + encodeURIComponent(String(query).trim()) + '?page=' + page;
  console.log('zlibrary search url: ' + url);

  return fetch(url, {
    headers: {
      'Accept': 'text/html,application/xhtml+xml',
      'Referer': REFERER
    }
  }).then(function(r) {
    if (r.status !== 200) return [];
    var html = r.body || '';
    var results = [];
    var seen = {};

    var bookRowRe = /<div[^>]+class="[^"]*bookRow[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
    var rows = _allMatches(html, bookRowRe);

    if (rows.length === 0) {
      var fallbackRe = /<a[^>]+href="(\/book\/\d+\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      var fallbackMatches = _allMatches(html, fallbackRe);
      for (var fi = 0; fi < fallbackMatches.length; fi++) {
        var fHref = fallbackMatches[fi][1];
        var fLink = absUrl(fHref, SITE);
        if (seen[fLink]) continue;
        seen[fLink] = true;
        var fTitle = _cleanText(fallbackMatches[fi][2]);
        if (!fTitle || fTitle.length < 2) continue;

        var fIdx = html.indexOf(fallbackMatches[fi][0]);
        var fSnippet = fIdx >= 0 ? html.substring(Math.max(0, fIdx - 500), fIdx) : '';
        var fCoverM = fSnippet.match(/<img[^>]+src="([^"]+\.(?:jpg|jpeg|png|webp))"/i);
        var fCover = fCoverM ? absUrl(fCoverM[1], SITE) : null;

        results.push({
          id: _idFromUrl(fLink),
          title: fTitle,
          cover: fCover,
          url: fLink,
          type: 'novel'
        });
      }
      console.log('zlibrary search count (fallback): ' + results.length);
      return results;
    }

    for (var i = 0; i < rows.length; i++) {
      var chunk = rows[i][1];

      var titleM = chunk.match(/<a[^>]+href="(\/book\/\d+\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!titleM) continue;
      var link = absUrl(titleM[1], SITE);
      if (seen[link]) continue;
      seen[link] = true;
      var title = _cleanText(titleM[2]);
      if (!title || title.length < 2) continue;

      var coverM = chunk.match(/<img[^>]+src="([^"]+\.(?:jpg|jpeg|png|webp))"/i);
      var cover = coverM ? absUrl(coverM[1], SITE) : null;

      var authorM = chunk.match(/<a[^>]+class="[^"]*author[^"]*"[^>]*>([^<]+)<\/a>/i);
      if (!authorM) authorM = chunk.match(/<div[^>]+class="[^"]*authors?[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      var author = authorM ? _cleanText(authorM[1]) : '';

      var formatM = chunk.match(/(\b(?:pdf|epub|djvu|fb2|mobi|txt|rtf|doc)\b)/i);
      var format = formatM ? formatM[1].toUpperCase() : '';

      results.push({
        id: _idFromUrl(link),
        title: title + (format ? ' [' + format + ']' : ''),
        cover: cover,
        url: link,
        type: 'novel'
      });
    }
    console.log('zlibrary search count: ' + results.length);
    return results;
  });
}

function _parseMetaField(html, label) {
  var re = new RegExp(
    '<div[^>]+class="[^"]*property(?:_label|_value)?[^"]*"[^>]*>\\s*' + label + '\\s*(?:<\\/div>)?[\\s\\S]*?<div[^>]+class="[^"]*property_value[^"]*"[^>]*>([\\s\\S]*?)<\\/div>',
    'i'
  );
  var m = html.match(re);
  if (m) return m[1];
  var re2 = new RegExp(
    '<span[^>]*>\\s*' + label + '\\s*(?::\\s*)?<\\/span>\\s*<span[^>]*>([\\s\\S]*?)<\\/span>',
    'i'
  );
  m = html.match(re2);
  return m ? m[1] : '';
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
  return fetch(url, {
    headers: { 'Referer': REFERER }
  }).then(function(r) {
    if (r.status !== 200) {
      throw new Error('detail HTTP ' + r.status);
    }
    var html = r.body || '';

    var titleM = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
                 html.match(/<div[^>]+class="[^"]*bookTitle[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    var title = titleM ? _cleanText(titleM[1]) : '';

    var coverM = html.match(/<img[^>]+class="[^"]*cover[^"]*"[^>]+src="([^"]+)"/i) ||
                 html.match(/<img[^>]+src="([^"]+\/covers\/[^"]+\.(?:jpg|jpeg|png|webp))"/i) ||
                 html.match(/<img[^>]+itemprop="image"[^>]+src="([^"]+)"/i);
    var cover = coverM ? absUrl(coverM[1], SITE) : null;

    var descM = html.match(/<div[^>]+id="bookDescription[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                html.match(/<div[^>]+class="[^"]*bookDescription[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                html.match(/<div[^>]+itemprop="description"[^>]*>([\s\S]*?)<\/div>/i);
    var description = descM ? _cleanText(descM[1]) : '';

    var authors = _parseLinks(
      _parseMetaField(html, 'Author') ||
      _parseMetaField(html, 'Authors')
    );
    if (authors.length === 0) {
      var authorBlockM = html.match(/<div[^>]+class="[^"]*authors?[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      if (authorBlockM) authors = _parseLinks(authorBlockM[1]);
    }

    var year = _cleanText(_parseMetaField(html, 'Year') || _parseMetaField(html, 'Published'));
    var publisher = _parseLinks(_parseMetaField(html, 'Publisher'));
    var lang = _cleanText(_parseMetaField(html, 'Language') || _parseMetaField(html, 'Lang'));
    var formatRaw = _cleanText(_parseMetaField(html, 'File') || _parseMetaField(html, 'Extension') || _parseMetaField(html, 'Format'));
    var size = _cleanText(_parseMetaField(html, 'Size'));
    var pages = _cleanText(_parseMetaField(html, 'Pages'));

    var genres = _parseLinks(_parseMetaField(html, 'Category') || _parseMetaField(html, 'Categories'));
    if (genres.length === 0) genres = _parseLinks(_parseMetaField(html, 'Tags'));

    var extraInfo = [];
    if (formatRaw) extraInfo.push(formatRaw.toUpperCase());
    if (size) extraInfo.push(size);
    if (pages) extraInfo.push(pages + ' pages');
    if (lang) extraInfo.push(lang);
    if (year) extraInfo.push(year);
    if (publisher.length) extraInfo.push(publisher.join(', '));

    if (extraInfo.length > 0 && description) {
      description = description + '\n\n---\n' + extraInfo.join(' | ');
    } else if (extraInfo.length > 0 && !description) {
      description = extraInfo.join(' | ');
    }

    var chapters = [];
    chapters.push({
      id: _idFromUrl(url) + '__full',
      title: title + (formatRaw ? ' (' + formatRaw.toUpperCase() + ')' : ''),
      number: 1,
      url: url,
      date: year || ''
    });

    console.log('zlibrary detail: title=' + title + ' author=' + authors.join(', '));
    return {
      id: _idFromUrl(url),
      sourceId: SOURCE_ID,
      title: title,
      cover: cover,
      url: url,
      description: description,
      status: 'completed',
      genres: genres,
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
  return fetch(chapterUrl, {
    headers: { 'Referer': REFERER }
  }).then(function(r) {
    if (r.status !== 200) return { title: '', html: '', nextUrl: '', prevUrl: '' };
    var html = r.body || '';

    var titleM = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    var title = titleM ? _cleanText(titleM[1]) : '';

    var descM = html.match(/<div[^>]+id="bookDescription[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                html.match(/<div[^>]+class="[^"]*bookDescription[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                html.match(/<div[^>]+itemprop="description"[^>]*>([\s\S]*?)<\/div>/i);
    var content = descM ? _cleanText(descM[1]) : '';

    var downloadM = html.match(/<a[^>]+href="([^"]*(?:download|dl|get)[^"]*)"[^>]*>/i);
    var downloadUrl = downloadM ? absUrl(downloadM[1], SITE) : '';

    if (downloadUrl && content) {
      content = content + '\n\n---\nDownload: ' + downloadUrl;
    } else if (downloadUrl && !content) {
      content = 'Download: ' + downloadUrl;
    }

    return {
      title: title,
      html: content,
      nextUrl: '',
      prevUrl: ''
    };
  });
}
