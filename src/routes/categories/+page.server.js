import { fail } from '@sveltejs/kit';
import { categories, createNamed, renameNamed } from '#lib/server/manage.js';
export async function load() { return {categories:await categories()}; }
export const actions={
 create:async ({request})=>{const name=String((await request.formData()).get('name')||'').trim();if(!name||name.length>120)return fail(400,{error:'Enter a category name (up to 120 characters).'});try {await createNamed('categories',name);} catch(e) {if(/** @type {NodeJS.ErrnoException} */ (e).code==='23505')return fail(400,{error:'That category already exists.'});throw e;}},
 rename:async ({request})=>{const f=await request.formData(),name=String(f.get('name')||'').trim();if(!name||name.length>120)return fail(400,{error:'Enter a valid name.'});try {await renameNamed('categories',String(f.get('id')||''),name);} catch(e) {if(/** @type {NodeJS.ErrnoException} */ (e).code==='23505')return fail(400,{error:'That name is already in use.'});throw e;}}
};
