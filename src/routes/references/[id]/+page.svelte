<script lang="ts">
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();
</script>

<svelte:head><title>{params.id} · Taste Vault</title></svelte:head>

<h1>Reference {params.id}</h1>
<p>This route will show saved screenshots, metadata, and capture status.</p>
