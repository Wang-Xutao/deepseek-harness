function api() {
  return window.bafDialog
}

function cancelClose() {
  api()?.closeChoice({ action: 'cancel', remember: false })
}

document.getElementById('cancel').addEventListener('click', cancelClose)

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    cancelClose()
  }
})

document.getElementById('ok').addEventListener('click', () => {
  const action = document.querySelector('input[name="action"]:checked')?.value ?? 'tray'
  const remember = document.getElementById('remember').checked
  api()?.closeChoice({ action, remember })
})
