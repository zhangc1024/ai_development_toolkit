import { createApp } from 'vue'
import DesktopApp from './DesktopApp.vue'
import '../style.css'

// Files dropped outside a tool must never navigate away from the application.
window.addEventListener('dragover', event => event.preventDefault())
window.addEventListener('drop', event => event.preventDefault())
createApp(DesktopApp).mount('#app')
