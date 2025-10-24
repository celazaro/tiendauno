<template>

  <!-- Testimonials Section -->
  <section id="testimonials" class="testimonials section light-background  vh-100  p-0">

    <div class="container-fluid row align-items-center p-2">
      <h2 class="text-center">ENCUENTRE AQUÍ LOS MEJORES PRECIOS</h2>
      <div class="col-lg-7">
        <div class="table-wrapper">
          <table class="table table-striped table-bordered custom-table">
            <thead class="text-center">
              <tr>
                <th>Producto</th>
                <th>Precio</th>
                <th>Unidad</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="prod in productos" :key="prod.id">
                <td>{{ prod.nombre }}</td>
                <td class="text-center">{{ formatCurrency(prod.precio) }}</td>
                <td class="text-center">{{ prod.precio_tipo_descripcion }}</td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>

      <div class="col-lg-5">
        <div class="testimonials-slider swiper my-swiper">

          <div class="swiper-wrapper" >
  
            <div class="swiper-slide " v-for="producto in productos" :key="producto.id">
              <div class="testimonial-item">
                <div class="align-items-center">
                  <div class=" d-none d-lg-block flex-column justify-content-center align-items-center ">
                    <div class="featured-img-wrapper">
                      <img :src="`${producto.imagen}`" class="featured-img " alt="">
                    </div>
                    <div class="text-center mt-2">
                      <p>
                        {{ producto.nombre}}
                        <br></br>
                        {{ producto.descripcion }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div><!-- End Testimonial Item -->

          </div>

        </div>

      </div>


    </div>

  </section><!-- /Testimonials Section -->


</template>



<script setup>

import { ref, onMounted, nextTick } from 'vue'

// 👇 Importa la variable de entorno
const API_BASE_URL = import.meta.env.VITE_API_URL

const productos = ref([]) // Variable reactiva para los productos


async function listarProductos() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/productos/`, { // Reemplaza con la URL de tu API
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        
      }
    
    })

    if (!response.ok) {
      if (response.status === 404) {
        productos.value = []
        return
      } else {
        throw new Error('Error inesperado al obtener los productos')
      }
    }
    
    const data = await response.json()

    productos.value = data


    console.log('Datos de productos:', productos.value)

    // Esperar a que Vue renderice los slides antes de inicializar Swiper
    await nextTick()

    if (window.Swiper) {
      new window.Swiper('.my-swiper', {
        slidesPerView: 1,
        loop: true,
        speed: 2000,
        autoplay: {
          delay: 5000,
        },
        effect: 'cube', // 👈 cambia el tipo de transición aquí  (slide, fade, cube, coverflow, flip)
        navigation: {
          nextEl: '.swiper-button-next',
          prevEl: '.swiper-button-prev',
        },

        fadeEffect: {
          crossFade: true, // opcional: mezcla los slides al cambiar
        },

/*       cubeEffect: {
          shadow: true,
          slideShadows: true,
          shadowOffset: 20,
          shadowScale: 0.94,
      }, */

/*       cardsEffect: {
        perSlideOffset: 10,
        perSlideRotate: 2,
        rotate: true,
        slideShadows: true,
      }, */

      })
    }

  } catch (error) {
    console.error('Error:', error)
    alert('Error en la conexión.')
  }
}

onMounted(() => {

  listarProductos()

})

function formatCurrency(value) {
  const number = parseFloat(value)
  if (isNaN(number)) return value  // si no se puede convertir, devuelve el valor original

  return number.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0
  })
}


</script>


<style scoped>

/* Mantener la tabla legible: ajustar fuente según lo tengas */
.custom-table {
  font-size: 1.0rem;
}

/* Centrar encabezados y columnas de números (ya lo tenías) */
.custom-table th {
  text-align: center;
  vertical-align: middle;
}
.custom-table td.text-center {
  text-align: center;
  vertical-align: middle;
}

</style>
