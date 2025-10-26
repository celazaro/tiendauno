<template>
  <section :class="['kiosk-slideshow', hideCursorInKiosk ? 'hide-cursor' : '']" aria-live="off">
    <!-- Reloj fijo superior derecho (HH:MM) -->
    <div class="fixed-clock" aria-hidden="false">
      <div class="clock-time">{{ nowTimeHM }}</div>
      <div class="clock-date" v-text="nowDateShort"></div>
    </div>

    <!-- Contenedor 16:9 centrado -->
    <div class="screen-wrapper">
      <div class="screen-16-9">
        <div class="slides" :style="{ height: '100%' }">
          <transition-group name="crossfade" tag="div">
            <!-- Tabla completa (aparece primero) -->
            <div
              v-if="currentMode === 'table'"
              key="table-slide"
              class="slide table-slide"
            >
              <div class="table-wrap-full">
                <h2 class="table-title">Listado completo de productos</h2>
                <div class="table-scroll">
                  <table class="full-table">
                    <thead>
                      <tr><th>Producto</th><th>Precio</th><th>Unidad</th></tr>
                    </thead>
                    <tbody>
                      <tr v-for="p in productos" :key="'full-'+p.id">
                        <td class="ft-name">{{ p.nombre }}</td>
                        <td class="ft-price">{{ formatCurrency(p.precio) }}</td>
                        <td class="ft-unit">{{ p.precio_tipo_descripcion }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <!-- Product slides -->
            <div
              v-for="(slide, idx) in visibleSlides"
              :key="'prod-'+slideKey(slide, idx)"
              v-show="currentMode === 'product' && idx === activeIdx"
              class="slide"
              :data-offer="isOnOffer(slide) ? 'true' : 'false'"
            >
              <div class="slide-media">
                <img
                  :src="slide.imagen || placeholderImage"
                  :alt="slide.nombre"
                  class="slide-img"
                  @error="onImageError"
                  loading="lazy"
                />
                <div class="slide-gradient"></div>
                <div v-if="isOnOffer(slide)" class="offer-badge" aria-hidden="true">OFERTA</div>
              </div>

              <div class="slide-content">
                <div class="left-block">
                  <h1 class="product-name" v-text="slide.nombre"></h1>
                  <div class="product-price" v-text="formatCurrency(slide.precio)"></div>
                  <div class="product-unit" v-if="slide.precio_tipo_descripcion" v-text="slide.precio_tipo_descripcion"></div>
                  <div class="product-desc" v-html="longSafeDescription(slide.descripcion)"></div>
                </div>

                <div class="right-block">
                  <div class="info-card">
                    <table class="info-table" aria-hidden="true">
                      <tbody>
                        <tr><td class="k">Código</td><td class="v">{{ slide.codigo || '—' }}</td></tr>
                        <tr><td class="k">Stock</td><td class="v">{{ slide.stock !== undefined ? slide.stock : '—' }}</td></tr>
                        <tr><td class="k">Últ. precio</td><td class="v">{{ slide.precio_anterior ? formatCurrency(slide.precio_anterior) : '—' }}</td></tr>
                        <tr v-if="slide.descuento"><td class="k">Descuento</td><td class="v">{{ slide.descuento }}%</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            <!-- Video slide -->
            <div
              v-if="currentMode === 'video'"
              :key="'video-'+videoKey"
              class="slide video-slide"
            >
              <video
                ref="promoVideo"
                :src="currentVideo"
                muted
                autoplay
                playsinline
                class="video-el"
                @error="onVideoError"
              ></video>
              <div class="video-caption">Promocional</div>
            </div>
          </transition-group>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'

/* Props (configurables) */
const props = defineProps({
  perProductSlideSec: { type: Number, default: 6 },
  videoDurationSec: { type: Number, default: 10 },
  tableDurationSec: {
    type: Number,
    default: 8,
    validator: v => v >= 6 // asegura mínimo 6s
  },
  showVideoEvery: { type: Number, default: 3 },
  preloadAhead: { type: Number, default: 2 },
  transitionMs: { type: Number, default: 900 },
  hideCursorInKiosk: { type: Boolean, default: true },
  videoPlaylist: { type: Array, default: () => [
    // reemplaza por tus MP4 de verdulería
    'https://www.w3schools.com/html/mov_bbb.mp4',
    'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'
  ] }
})

/* CONFIG y estado */
const API_BASE_URL = import.meta.env.VITE_API_URL
const productos = ref([])
const activeIdx = ref(0)
const currentMode = ref('table') // start with table as first slide
let productTimer = null
let modeTimer = null
let slideCounterSinceVideo = 0
let playlistIndex = 0

/* enforce minimum for tableDurationSec */
const effectiveTableDuration = Math.max(6, props.tableDurationSec)

/* computed helpers */
const currentVideo = computed(() => props.videoPlaylist[playlistIndex % props.videoPlaylist.length])
const videoKey = computed(() => playlistIndex)

/* placehoder */
const placeholderImage = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="100%" height="100%" fill="%23081220"/><text x="50%" y="50%" fill="%23cccccc" font-size="32" font-family="Arial" text-anchor="middle" alignment-baseline="middle">Imagen no disponible</text></svg>'

/* Clock HH:MM */
const nowTimeHM = ref('')
const nowDateShort = ref('')
let clockInterval = null
function startClock(){ updateClock(); clockInterval = setInterval(updateClock,1000) }
function updateClock() {
  const d = new Date()
  nowTimeHM.value = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  nowDateShort.value = d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short' })
}

/* API fetch con backoff exponencial */
let retryTimer = null
let retryAttempts = 0
const maxBackoffMs = 5 * 60 * 1000
async function listarProductos() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/productos/`, { method: 'GET', headers: { Accept: 'application/json' } })
    if (!res.ok) {
      if (res.status === 404) { productos.value = []; scheduleRetry(); return }
      throw new Error('HTTP ' + res.status)
    }
    const data = await res.json()
    productos.value = Array.isArray(data) ? data : []
    retryAttempts = 0
    clearRetryTimer()
    if (activeIdx.value >= productos.value.length) activeIdx.value = 0
    await nextTick()
    preloadImagesForIndex(activeIdx.value)
  } catch (e) {
    console.error('listarProductos', e)
    scheduleRetry()
  }
}
function scheduleRetry() {
  if (retryTimer) return
  retryAttempts = Math.min(10, retryAttempts + 1)
  const backoff = Math.min(1000 * Math.pow(2, retryAttempts), maxBackoffMs)
  retryTimer = setTimeout(async () => {
    retryTimer = null
    await listarProductos()
  }, backoff)
}
function clearRetryTimer() { if (retryTimer) { clearTimeout(retryTimer); retryTimer = null } }

/* Ciclo de modos:
   - table (primero) -> producto slides -> after showVideoEvery -> video -> table -> resume productos
*/
function startProductTimer() {
  stopProductTimer()
  productTimer = setInterval(() => advanceProduct(), props.perProductSlideSec * 1000)
}
function stopProductTimer() { if (productTimer) { clearInterval(productTimer); productTimer = null } }
function advanceProduct() {
  if (!productos.value.length) return
  activeIdx.value = (activeIdx.value + 1) % productos.value.length
  slideCounterSinceVideo += 1
  preloadImagesForIndex(activeIdx.value)

  if (slideCounterSinceVideo >= props.showVideoEvery && props.videoPlaylist.length) {
    slideCounterSinceVideo = 0
    switchToVideoMode()
  }
}
function switchToVideoMode() {
  stopProductTimer()
  currentMode.value = 'video'
  clearTimeout(modeTimer)
  modeTimer = setTimeout(() => {
    switchToTableMode()
  }, props.videoDurationSec * 1000)
}
function switchToTableMode() {
  currentMode.value = 'table'
  clearTimeout(modeTimer)
  modeTimer = setTimeout(() => {
    // after table, resume product mode and advance to next product
    currentMode.value = 'product'
    activeIdx.value = (activeIdx.value + 1) % Math.max(1, productos.value.length || 1)
    playlistIndex = (playlistIndex + 1) % props.videoPlaylist.length
    preloadImagesForIndex(activeIdx.value)
    startProductTimer()
  }, effectiveTableDuration * 1000)
}

/* Preload imágenes próximas */
function preloadImage(url) { if (!url) return; const img = new Image(); img.src = url }
function preloadImagesForIndex(index) {
  for (let i = 1; i <= props.preloadAhead; i++) {
    const idx = (index + i) % Math.max(1, productos.value.length || 1)
    const p = productos.value[idx]
    if (p && p.imagen) preloadImage(p.imagen)
  }
}

/* Oferta detection */
function isOnOffer(p) {
  if (!p) return false
  if (p.precio_anterior && Number(p.precio_anterior) > Number(p.precio || 0)) return true
  if (p.descuento && Number(p.descuento) > 0) return true
  return false
}

/* UTIL */
const visibleSlides = computed(() => productos.value)
function formatCurrency(v) {
  const n = parseFloat(v)
  if (isNaN(n)) return v || ''
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 })
}
function longSafeDescription(html) {
  if (!html) return ''
  const t = String(html).replace(/<\/?[^>]+(>|$)/g, '')
  return t.length > 300 ? t.slice(0,297) + '...' : t
}
function onImageError(e) { e.target.src = placeholderImage }
function onVideoError(e) { console.warn('Video error', e) }

/* key util */
function slideKey(item, idx) { return `${item?.id ?? idx}-${item?.updated_at ?? ''}` }

/* Watchers */
watch(activeIdx, (newIdx) => preloadImagesForIndex(newIdx))

/* Lifecycle */
onMounted(() => {
  // set CSS transition variable
  try { document.documentElement.style.setProperty('--trans', `${props.transitionMs}ms`) } catch {}
  listarProductos()
  // start with table visible first
  currentMode.value = 'table'
  modeTimer = setTimeout(() => {
    // after initial table duration, go to first product and start product rotation
    currentMode.value = 'product'
    startProductTimer()
  }, effectiveTableDuration * 1000)

  startClock()
  const refreshInterval = setInterval(listarProductos, 2 * 60 * 1000)
  onBeforeUnmount(() => {
    stopProductTimer()
    clearRetryTimer()
    clearInterval(refreshInterval)
    if (clockInterval) clearInterval(clockInterval)
    if (modeTimer) clearTimeout(modeTimer)
  })
})
</script>

<style scoped>
/* page */
.kiosk-slideshow { width:100%; height:100vh; overflow:hidden; position:relative; background:#031025; font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color:#fff; }
.kiosk-slideshow.hide-cursor { cursor: none; }

/* Fixed clock top-right: HH:MM and short date */
.fixed-clock {
  position: fixed;
  top: 14px;
  right: 18px;
  z-index: 9999;
  text-align: right;
  background: rgba(2,6,23,0.48);
  padding: 8px 12px;
  border-radius: 8px;
  box-shadow: 0 8px 20px rgba(0,0,0,0.6);
  backdrop-filter: blur(6px);
}
.clock-time { font-size: 1.2rem; font-weight: 800; color: #ffd78a }
.clock-date { font-size: 0.85rem; color: rgba(255,255,255,0.9) }

/* center 16:9 screen */
.screen-wrapper { width:100%; height:100%; display:flex; align-items:center; justify-content:center; padding: 12px; box-sizing:border-box; }
.screen-16-9 {
  width: calc(100vh * 16 / 9); /* try to keep 16:9 based on height */
  max-width: 100%;
  aspect-ratio: 16 / 9;
  background: #000;
  position: relative;
  overflow: hidden;
  border-radius: 6px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.7);
}

/* crossfade transition */
.crossfade-enter-active, .crossfade-leave-active { transition: opacity var(--trans, 900ms) ease, transform var(--trans, 900ms) ease; }
.crossfade-enter-from, .crossfade-leave-to { opacity: 0; transform: scale(1.015); }
.crossfade-enter-to, .crossfade-leave-from { opacity: 1; transform: scale(1); }
:root { --trans: 900ms; }

/* slides full inside 16:9 box */
.slides { position:relative; width:100%; height:100%; }
.slide { position:absolute; inset:0; display:flex; flex-direction:column; justify-content:space-between; }

/* media + kenburns */
.slide-media { position:absolute; inset:0; overflow:hidden; z-index:0; }
.slide-img { width:110%; height:110%; object-fit:cover; transform-origin:center; animation: kenburns 14s ease-in-out both; opacity:0.98; display:block; }
@keyframes kenburns { 0% { transform: scale(1.05) translate(0,0); } 50% { transform: scale(1.12) translate(-1.5%, -1.5%); } 100% { transform: scale(1.06) translate(0,0); } }
.slide-gradient { position:absolute; inset:0; background: linear-gradient(180deg, rgba(2,6,23,0.12), rgba(2,6,23,0.6) 65%, rgba(2,6,23,0.9)); z-index:1; }

/* offer badge */
.offer-badge {
  position: absolute;
  left: 18px;
  top: 18px;
  background: linear-gradient(90deg,#ff4d4f,#ffb86b);
  color: #071018;
  padding: 10px 14px;
  border-radius: 10px;
  font-weight:900;
  letter-spacing:1px;
  z-index:3;
  box-shadow: 0 12px 30px rgba(255,77,79,0.12);
  transform-origin: left top;
  animation: badgePop 600ms cubic-bezier(.2,.9,.3,1);
}
@keyframes badgePop { 0% { transform: scale(0.6); opacity:0 } 70% { transform: scale(1.08); opacity:1 } 100% { transform: scale(1); } }

/* content */
.slide-content { position:relative; z-index:2; display:flex; gap:28px; padding:48px 64px; align-items:flex-end; height: calc(100% - 120px); box-sizing:border-box; }
.left-block { flex:1 1 60%; max-width:70%; }
.right-block { width:320px; display:flex; align-items:flex-end; justify-content:flex-end; }

/* product text */
.product-name { font-size: clamp(20px, 3.5vw, 48px); margin:0 0 12px; font-weight:800; letter-spacing:-0.6px; color:#fff; text-shadow: 0 6px 24px rgba(2,6,23,0.6); }
.product-price { font-size: clamp(18px, 3vw, 40px); font-weight:900; color: #ffcf7a; margin-bottom:6px; text-shadow: 0 6px 18px rgba(0,0,0,0.6); }
.product-unit { color: rgba(255,255,255,0.85); font-weight:700; margin-bottom:12px }
.product-desc { color: rgba(255,255,255,0.88); font-size: clamp(12px, 1.4vw, 16px); max-width: 70%; line-height:1.3; }

/* info card */
.info-card { background: rgba(255,255,255,0.03); padding:14px; border-radius:12px; min-width:220px; box-shadow: 0 12px 30px rgba(0,0,0,0.6); backdrop-filter: blur(4px); }
.info-table { width:100%; border-collapse:collapse; color: rgba(255,255,255,0.92); }
.info-table .k { font-weight:700; padding:6px 0; width:40%; color: rgba(255,255,255,0.8) }
.info-table .v { text-align:right; padding:6px 0; font-weight:800; color:#ffd99a }

/* video */
.video-slide { position:absolute; inset:0; display:flex; flex-direction:column; justify-content:space-between; align-items:center; }
.video-el { width:100%; height:100%; object-fit:cover; display:block; }
.video-caption { position:absolute; left:18px; top:12px; z-index:4; padding:6px 10px; background: linear-gradient(90deg,#ffd78a,#ff8a6b); color:#071018; font-weight:800; border-radius:6px; }

/* table slide */
.table-slide { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; padding:20px; box-sizing:border-box; }
.table-wrap-full { width:96%; height:96%; background: rgba(0,0,0,0.45); padding:14px; border-radius:8px; box-shadow: 0 12px 30px rgba(0,0,0,0.6); display:flex; flex-direction:column; }
.table-title { margin:0 0 8px; font-size:1.2rem; color:#ffd78a }
.table-scroll { flex:1; overflow:auto; padding-right:8px; }
.full-table { width:100%; border-collapse: collapse; color:#fff; }
.full-table thead th { text-align:left; padding:8px; border-bottom: 1px solid rgba(255,255,255,0.06); color:#fff }
.full-table tbody td { padding:8px; border-bottom: 1px solid rgba(255,255,255,0.03); color: rgba(255,255,255,0.95) }
.ft-price { text-align:right; font-weight:800 }
.ft-unit { text-align:center; color: rgba(255,255,255,0.9) }

/* reduce-motion */
@media (prefers-reduced-motion: reduce) {
  .crossfade-enter-active, .crossfade-leave-active, .slide-img, .offer-badge { transition: none !important; animation: none !important }
  :root { --trans: 0ms }
}

/* responsive: if width smaller than height-based 16:9 calc, use full width */
@media (max-width: 1200px) {
  .screen-16-9 { width: 100%; height: calc(100vw * 9 / 16); aspect-ratio: 16/9; }
}
</style>