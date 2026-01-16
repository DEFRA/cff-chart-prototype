// Toggletip component
(function () {
  'use strict'

  function forEach (array, callback) {
    for (let i = 0; i < array.length; i++) {
      callback(array[i], i)
    }
  }

  const toggletips = () => {
    let timeout
    let currentToggletip

    const openToggletip = (toggletip) => {
      const viewportMargin = 15
      const info = toggletip.querySelector('.defra-toggletip__info')
      const text = info.querySelector('.defra-toggletip__text')
      const arrow = info.querySelector('.defra-toggletip__arrow')
      text.innerHTML = ''

      timeout = window.setTimeout(() => {
        closeToggletips()
        currentToggletip = toggletip
        text.innerHTML = `<span>${toggletip.getAttribute('data-toggletip-content')}</span>`
        toggletip.classList.add('defra-toggletip--open')

        const target = toggletip.querySelector('.defra-toggletip-target') || toggletip
        const targetWidth = target.getBoundingClientRect().width
        const targetLeft = target.getBoundingClientRect().left
        const viewportWidth = document.body.clientWidth
        let infoWidth = info.getBoundingClientRect().width
        infoWidth = infoWidth > (viewportWidth - (viewportMargin * 2)) ? viewportWidth - (viewportMargin * 2) : infoWidth

        let infoOffsetX = (targetWidth - infoWidth) / 2

        if ((targetLeft + infoOffsetX) < viewportMargin) {
          infoOffsetX = viewportMargin - targetLeft
        } else if ((targetLeft + infoOffsetX + infoWidth) > (viewportWidth - viewportMargin)) {
          infoOffsetX = (viewportWidth - viewportMargin - infoWidth) - targetLeft
        }

        arrow.style.left = `${(0 - infoOffsetX) + (targetWidth / 2)}px`
        info.style.marginLeft = `${infoOffsetX}px`
        info.style.width = `${infoWidth}px`

        if (info.getBoundingClientRect().top < viewportMargin) {
          toggletip.classList.add('defra-toggletip--bottom')
        }
      }, 100)
    }

    const closeToggletips = () => {
      clearTimeout(timeout)
      currentToggletip = null
      const toggletips = document.querySelectorAll('.defra-toggletip--open')
      if (toggletips.length) {
        forEach(toggletips, toggletip => {
          toggletip.classList.remove('defra-toggletip--open')
          toggletip.classList.remove('defra-toggletip--bottom')
          const info = toggletip.querySelector('.defra-toggletip__info')
          info.style.removeProperty('width')
          info.style.removeProperty('margin-left')
          const text = info.querySelector('span:first-child')
          text.innerHTML = ''
          const arrow = info.querySelector('.defra-toggletip__arrow')
          arrow.style.removeProperty('left')
        })
      }
    }

    const toggletips = document.querySelectorAll('[data-toggletip]')
    forEach(toggletips, (toggletip) => {
      const info = document.createElement('span')
      info.className = 'defra-toggletip__info'
      info.setAttribute('role', 'status')
      info.innerHTML = '<span class="defra-toggletip__text"></span><span class="defra-toggletip__arrow"></span>'

      toggletip.classList.add('defra-toggletip')
      const container = document.createElement('span')
      container.className = 'defra-toggletip__container'
      container.setAttribute('data-toggletip-container', '')
      const button = document.createElement('button')
      button.className = 'defra-toggletip__button defra-toggletip-target'
      button.setAttribute('aria-label', toggletip.getAttribute('data-toggletip-label') || 'More information')
      button.innerHTML = `
        <span class="defra-toggletip__button-icon">
        </span>
        <span class="defra-toggletip__button-text">i</span>
      `
      container.appendChild(button)
      container.appendChild(info)
      toggletip.appendChild(container)
    })

    document.addEventListener('click', (e) => {
      const isTarget = e.target.classList.contains('defra-toggletip-target')
      const isInfo = !!e.target.closest('.defra-toggletip__info')
      if (isTarget) {
        const toggletip = e.target.closest('.defra-toggletip')
        openToggletip(toggletip)
      } else if (!isInfo) {
        closeToggletips()
      }
    })

    document.addEventListener('keyup', (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        closeToggletips()
      }
    })

    document.addEventListener('mouseenter', (e) => {
      if (e.target === document) return
      const isTarget = !!e.target.closest('.defra-toggletip-target')
      if (isTarget && !currentToggletip) {
        const toggletip = e.target.closest('.defra-toggletip')
        openToggletip(toggletip)
      }
    }, true)

    document.addEventListener('mouseleave', (e) => {
      if (e.target === document) return
      const isTarget = e.target.hasAttribute('data-toggletip-container')
      if (isTarget) {
        closeToggletips()
      }
    }, true)

    document.addEventListener('focusin', (e) => {
      const toggletip = e.target.closest('.defra-toggletip')
      if (toggletip) {
        closeToggletips()
        openToggletip(toggletip)
      }
    })

    document.addEventListener('focusout', (e) => {
      const toggletip = e.target.closest('.defra-toggletip')
      if (toggletip) {
        closeToggletips()
      }
    })
  }

  if (typeof window !== 'undefined') {
    window.flood = window.flood || {}
    window.flood.createToggletips = () => {
      return toggletips()
    }
  }
})()
