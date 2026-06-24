<template>
    <router-view />
</template>

<script>
export default {
    name: "App"
};
</script>

<style scoped>
.logo {
    height: 6em;
    padding: 1.5em;
    will-change: filter;
}
.logo:hover {
    filter: drop-shadow(0 0 2em rgba(var(--p-primary-rgb), 0.67));
}
.logo.vue:hover {
    filter: drop-shadow(0 0 2em rgba(var(--p-success-rgb), 0.67));
}
</style>
