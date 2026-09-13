import type { MetadataRoute } from 'next';
export default function manifest():MetadataRoute.Manifest{
  return {id:'/',name:'Cafe loyalty',short_name:'Loyalty',description:'Your separate cafe loyalty cards in one app.',start_url:'/app',scope:'/',display:'standalone',background_color:'#FAFAF7',theme_color:'#166534',lang:'en',icons:[
    {src:'/icons/icon-192-v1.png',sizes:'192x192',type:'image/png',purpose:'any'},
    {src:'/icons/icon-512-v1.png',sizes:'512x512',type:'image/png',purpose:'any'},
    {src:'/icons/maskable-192-v1.png',sizes:'192x192',type:'image/png',purpose:'maskable'},
    {src:'/icons/maskable-512-v1.png',sizes:'512x512',type:'image/png',purpose:'maskable'},
  ]};
}
