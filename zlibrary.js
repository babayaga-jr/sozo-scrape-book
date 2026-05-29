// Z-Library provider — https://z-library.sk
// Book library aggregator. Type is set to 'novel' as the closest match
// within the Sozo Read provider contract.
//
// The site uses custom web components (<z-bookcard>, <z-cover>) where
// most data lives as HTML attributes rather than nested text nodes —
// ideal for regex-based parsing.
//
// NOTE: Z-Library rotates domains. Change SITE below if the current
// mirror stops working. Known mirrors: z-library.sk, singlelogin.re,
// zlibrary-global.se

var SOURCE_ID = 'zlibrary';
var SITE = 'https://z-library.sk';
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

function _getAttr(tag, name) {
  if (!tag) return '';
  var re = new RegExp(name + '="([^"]*)"', 'i');
  var m = tag.match(re);
  return m ? _cleanText(m[1]) : '';
}

// ----------------------------------------------------------------------
// Search: /s/{query}?page=N
// Results live inside <div id="searchResultBox"> → <div class="book-item">
// → <z-bookcard href="..." id="..." extension="..." filesize="..." ...>
//   <div slot="title">Title</div>
//   <div slot="author">Author1; Author2</div>
//   <img data-src="cover_url">
// </z-bookcard>
// ----------------------------------------------------------------------
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

    var notFound = html.match(/<div[^>]+class="[^"]*notFound[^"]*"/i);
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

// ----------------------------------------------------------------------
// Detail page: /book/{id}/{slug}
// Structure:
//   <div class="row cardBooks">
//     <z-cover title="Book Title">
//       <img class="image" src="cover_url">
//     </z-cover>
//     <div class="col-sm-9">
//       <a href="/s/author">Author Name</a>  (one or more)
//     </div>
//     <div id="bookDescriptionBox">Description text</div>
//     <div class="bookDetailsBox">
//       <div class="property_year"><div class="property_value">2024</div></div>
//       <div class="property_publisher"><div class="property_value">...</div></div>
//       <div class="property_language"><div class="property_value">...</div></div>
//       <div class="property__file">PDF, 5.4 MB</div>
//       <div class="property_categories"><div class="property_value">...</div></div>
//     </div>
//     <a class="btn btn-default addDownloadedBook" href="/dl/...">Download</a>
//   </div>
// ----------------------------------------------------------------------
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
  return fetch(url, {
    headers: { 'Referer': REFERER }
  }).then(function(r) {
    if (r.status !== 200) {
      throw new Error('detail HTTP ' + r.status);
    }
    var html = r.body || '';

    var wrapM = html.match(/<div[^>]+class="row cardBooks"[^>]*>([\s\S]*)<\/body>/i);
    var wrap = wrapM ? wrapM[1] : html;

    var zcoverM = html.match(/<z-cover\b([^>]*)>/i);

    var title = '';
    if (zcoverM) {
      var titleAttr = zcoverM[1].match(/title="([\s\S]*?)"/i);
      if (titleAttr) {
        title = _cleanText(titleAttr[1]);
      }
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

    var colM = wrap.match(/<div[^>]+class="col-sm-9"[^>]*>([\s\S]*?)<\/div>/i);
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

    var ratingM = html.match(/<div[^>]+class="book-rating"[^>]*>([\s\S]*?)<\/div>/i);
    var rating = ratingM ? _cleanText(ratingM[1].replace(/\n/g, ' ')) : '';

    var extraInfo = [];
    if (extension) extraInfo.push(extension);
    if (fileSize) extraInfo.push(fileSize);
    if (language) extraInfo.push(language);
    if (year) extraInfo.push(year);
    if (publisher) extraInfo.push('Publisher: ' + publisher);
    if (edition) extraInfo.push('Edition: ' + edition);
    if (rating) extraInfo.push('Rating: ' + rating);
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
  return fetch(chapterUrl, {
    headers: { 'Referer': REFERER }
  }).then(function(r) {
    if (r.status !== 200) return { title: '', html: '', nextUrl: '', prevUrl: '' };
    var html = r.body || '';

    var zcoverM = html.match(/<z-cover\b([^>]*)>/i);
    var title = '';
    if (zcoverM) {
      var titleAttr = zcoverM[1].match(/title="([\s\S]*?)"/i);
      if (titleAttr) title = _cleanText(titleAttr[1]);
    }
    if (!title) {
      var h1M = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      title = h1M ? _cleanText(h1M[1]) : '';
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

    return {
      title: title,
      html: content,
      nextUrl: '',
      prevUrl: ''
    };
  });
}
