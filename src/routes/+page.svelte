<script>
 let { data } = $props();
 /** @type {string[]} */ let selected = $state([]);
 let message = $state('');
 async function copy() { try { await navigator.clipboard.writeText(selected.join(', ')); message='IDs copied.'; } catch { message='Could not copy IDs. Select and copy them below.'; } }
</script>
<svelte:head><title>All References · Taste Vault</title></svelte:head>
<h1>All References</h1><p><a href="/references/new">Add references</a></p>
<form><label>Search <input name="q" value={data.q}></label> <label>Project <select name="project"><option value="">All projects</option><option value="unassigned" selected={data.project==='unassigned'}>Unassigned</option>{#each data.projects as project}<option value={project.id} selected={data.project===project.id}>{project.name}{project.archived_at ? ' (archived)' : ''}</option>{/each}</select></label> <label>Category <select name="category"><option value="">All categories</option>{#each data.categories as category}<option value={category.id} selected={data.category===category.id}>{category.name}</option>{/each}</select></label> <label>Sort <select name="sort"><option value="newest" selected={data.sort==='newest'}>Newest</option><option value="oldest" selected={data.sort==='oldest'}>Oldest</option><option value="title" selected={data.sort==='title'}>Title</option></select></label> <button>Apply</button></form>
<p>{data.total} references</p>
{#if selected.length}<p><button type="button" onclick={copy}>Copy {selected.length} selected IDs</button> <span role="status">{message}</span><br><small>{selected.join(', ')}</small></p>{/if}
<div class="gallery">{#each data.refs as ref}<article><label><input type="checkbox" value={ref.reference_id} bind:group={selected}> Select {ref.reference_id}</label><a href="/references/{ref.reference_id}">{#if ref.screenshot_id}<img src="/assets/{ref.screenshot_id}/thumbnail" alt="" loading="lazy">{:else}<div>No screenshot</div>{/if}<strong>{ref.title}</strong></a></article>{:else}<p>No references found.</p>{/each}</div>

{#if data.total>60}<nav aria-label="Gallery pages">{#if data.page>1}<a href={'?'+new URLSearchParams({q:data.q,project:data.project,category:data.category,sort:data.sort,page:String(data.page-1)})}>Previous</a>{/if} <span>Page {data.page}</span> {#if data.page*60<data.total}<a href={'?'+new URLSearchParams({q:data.q,project:data.project,category:data.category,sort:data.sort,page:String(data.page+1)})}>Next</a>{/if}</nav>{/if}
