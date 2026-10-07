import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import app from './backend/app.ts';
const root=path.dirname(fileURLToPath(import.meta.url));
const production=process.env.NODE_ENV==='production'||process.argv.includes('--production');
if(production){app.use(express.static(path.join(root,'dist')));app.get('*',(_req,res)=>res.sendFile(path.join(root,'dist/index.html')))}
else{const {createServer}=await import('vite');const vite=await createServer({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares)}
app.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Dary : http://localhost:'+(process.env.PORT||3000)));
