/** Help site helpers: embed flag, search locale, sidebar pager, no fold icons. */
;(function () {
  if (window.self !== window.top) {
    document.documentElement.classList.add('baf-embedded')
  }

  function localizeSearch() {
    var input = document.querySelector('#rtd-search-form input[type="text"], .wy-side-nav-search input[type="text"]')
    if (!input) return
    input.setAttribute('placeholder', '搜索文档')
    input.setAttribute('aria-label', '搜索文档')
    input.setAttribute('title', '输入关键词搜索')
  }

  /**
   * @returns {{ prev: { href: string, title: string } | null, next: { href: string, title: string } | null }}
   */
  function readPagerLinks() {
    /** @type {{ prev: { href: string, title: string } | null, next: { href: string, title: string } | null }} */
    var out = { prev: null, next: null }

    document.querySelectorAll('footer .rst-footer-buttons a.btn').forEach(function (link) {
      var text = (link.textContent || '').replace(/\s+/g, ' ').trim()
      var href = link.getAttribute('href')
      if (!href) return
      var title = link.getAttribute('title') || text
      if (/Previous/i.test(text)) out.prev = { href: href, title: title }
      if (/Next/i.test(text)) out.next = { href: href, title: title }
    })

    if (out.prev !== null || out.next !== null) return out

    document.querySelectorAll('.rst-versions .rst-current-version a').forEach(function (link) {
      var text = (link.textContent || '').replace(/\s+/g, ' ').trim()
      var href = link.getAttribute('href')
      if (!href) return
      if (/Previous|«|上一/.test(text)) out.prev = { href: href, title: link.getAttribute('title') || text }
      if (/Next|»|下一/.test(text)) out.next = { href: href, title: link.getAttribute('title') || text }
    })

    return out
  }

  function mountSidebarPager() {
    var nav = document.querySelector('.wy-nav-side')
    if (nav === null) return

    var existing = nav.querySelector('.baf-sidebar-pager')
    if (existing !== null) existing.remove()

    var pager = readPagerLinks()
    var bar = document.createElement('nav')
    bar.className = 'baf-sidebar-pager'
    bar.setAttribute('role', 'navigation')
    bar.setAttribute('aria-label', '文档翻页')

    function appendSlot(kind, link) {
      if (link !== null) {
        var a = document.createElement('a')
        a.className = 'baf-pager-' + kind
        a.href = link.href
        a.title = link.title
        a.textContent = kind === 'prev' ? '« 上一页' : '下一页 »'
        bar.appendChild(a)
        return
      }
      var stub = document.createElement('span')
      stub.className = 'baf-pager-' + kind + ' baf-pager-empty'
      stub.textContent = kind === 'prev' ? '« 上一页' : '下一页 »'
      bar.appendChild(stub)
    }

    appendSlot('prev', pager.prev)
    appendSlot('next', pager.next)
    nav.appendChild(bar)
  }

  function disableSidebarAffix() {
    document.querySelectorAll('.wy-menu[data-spy="affix"]').forEach(function (menu) {
      menu.removeAttribute('data-spy')
      menu.classList.remove('affix', 'affix-top', 'affix-bottom', 'wy-affix')
    })
  }

  function onReady() {
    localizeSearch()
    disableSidebarAffix()
    mountSidebarPager()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady)
  } else {
    onReady()
  }
})()
