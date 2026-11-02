<template><section role="alert" class="time-form"><h2>工具加载失败</h2><p>请重新加载，或返回首页选择工具。</p><button class="button" @click="reload">重试</button><a class="button" href="/">返回首页</a></section></template>
<script setup lang="ts">
function reload() { location.reload() }
</script>
