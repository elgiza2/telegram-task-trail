import { createFileRoute } from '@tanstack/react-router';
import { AdminPage } from './admin';
export const Route=createFileRoute('/101')({ssr:false,head:()=>({meta:[{title:'Orange — Control Room'},{name:'description',content:'Private Orange management for verified administrators.'},{property:'og:title',content:'Orange — Control Room'},{property:'og:description',content:'Private Orange administration.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),component:AdminPage});
