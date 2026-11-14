<script>let { data, form } = $props();</script>
<svelte:head><title>Categories · Taste Vault</title></svelte:head>
<div class="page-heading"><div><p class="eyebrow">Your library</p><h1>Categories</h1><p>Organize references across projects.</p></div></div>
{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
<form method="POST" action="?/create" class="inline-form"><label class="sr-only" for="new-category">Category name</label><input id="new-category" name="name" placeholder="New category name" required maxlength="120"><button>Create category</button></form>
<div class="management-list">{#each data.categories as category}<div class="management-row"><form method="POST" action="?/rename" class="inline-form"><input type="hidden" name="id" value={category.id}><label class="sr-only" for={'category-'+category.id}>Category name</label><input id={'category-'+category.id} name="name" value={category.name} required maxlength="120"><button class="secondary">Rename</button></form></div>{:else}<p class="empty">No categories yet.</p>{/each}</div>
