<script setup>
import { ref, watchEffect } from 'vue';

// A seeded address: the same URL gives the same ten products on every machine and after every restart.
const PRODUCTS = '/api/products?limit=10&seed=7';

const status = ref('loading');
const products = ref([]);
const error = ref('');
// `fail=0.5` makes half the requests fail, to see the error state. `delay=800` makes the loading state visible.
const flaky = ref(false);

watchEffect((onCleanup) => {
  const controller = new AbortController();
  onCleanup(() => controller.abort());
  status.value = 'loading';
  fetch(`${PRODUCTS}&delay=800${flaky.value ? '&fail=0.5' : ''}`, { signal: controller.signal })
    .then(async (response) => {
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response.json();
    })
    .then(({ results }) => {
      products.value = results;
      status.value = 'ready';
    })
    .catch((failure) => {
      if (controller.signal.aborted) return;
      error.value = failure.message;
      status.value = 'error';
    });
});
</script>

<template>
  <main>
    <h1>Products</h1>
    <label><input v-model="flaky" type="checkbox" /> Fail half the requests</label>
    <p v-if="status === 'loading'">Loading…</p>
    <p v-else-if="status === 'error'" role="alert">Could not load products: {{ error }}. Toggle the box to try again.</p>
    <table v-else>
      <thead>
        <tr><th>Name</th><th>Department</th><th>Price</th></tr>
      </thead>
      <tbody>
        <tr v-for="product in products" :key="product.id">
          <td>{{ product.name }}</td>
          <td>{{ product.department }}</td>
          <td>{{ product.price }} {{ product.currency }}</td>
        </tr>
      </tbody>
    </table>
  </main>
</template>
