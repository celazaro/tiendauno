
import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

// Importa solo CSS si no usas JS de Bootstrap
import 'bootstrap/dist/css/bootstrap.min.css'

// Opcional: importa los scripts JS de Bootstrap (si usas tooltips, modals, etc.)
import 'bootstrap/dist/js/bootstrap.bundle.min.js'


const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
