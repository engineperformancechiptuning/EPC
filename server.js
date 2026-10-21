const crypto=require('crypto');
require('dotenv').config();
const express=require('express');
const path=require('path');
const multer=require('multer');
const nodemailer=require('nodemailer');
const catalog=require('./catalog.json');
const app=express();app.disable('x-powered-by');app.use(express.json({limit:'12kb'}));
app.use(express.static(path.join(__dirname,'public'),{extensions:['html']}));
const prices=new Map(catalog.map(x=>[x.id,x]));
const uploads=new Map();
const orders=new Map(); // démo: remplacer par base de données persistante avant production
const mode=process.env.PAYPAL_MODE==='live'?'live':'sandbox';
const base=mode==='live'?'https://api-m.paypal.com':'https://api-m.sandbox.paypal.com';
async function token(){
 const id=process.env.PAYPAL_CLIENT_ID,secret=process.env.PAYPAL_CLIENT_SECRET;
 if(!id||!secret||secret.startsWith('REMPLACER'))throw Error('Identifiants PayPal non configurés');
 const response=await fetch(base+'/v1/oauth2/token',{method:'POST',headers:{'Authorization':'Basic '+Buffer.from(id+':'+secret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'});
 const data=await response.json();if(!response.ok)throw Error('Authentification PayPal refusée');return data.access_token;
}
async function paypal(url,method,body){const response=await fetch(base+url,{method,headers:{Authorization:'Bearer '+await token(),'Content-Type':'application/json','PayPal-Request-Id':crypto.randomUUID()},body:body?JSON.stringify(body):undefined});const data=await response.json();if(!response.ok)throw Error('PayPal '+response.status+': '+JSON.stringify(data).slice(0,500));return data;}
function cart(input){if(!Array.isArray(input)||input.length<1||input.length>29||new Set(input).size!==input.length||!input.every(x=>typeof x==='string'&&prices.has(x)))throw Error('Sélection invalide');return {items:input.map(x=>prices.get(x)),cents:input.reduce((n,x)=>n+prices.get(x).cents,0)};}

// Prototype Sandbox : fichiers conservés uniquement en mémoire (non adapté à la production).
const maxBytes=8*1024*1024;
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:maxBytes,files:1},fileFilter:(req,file,cb)=>{const ext=path.extname(file.originalname).toLowerCase();cb(null,['.bin','.ori','.hex','.zip'].includes(ext));}});
const emailRE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function clean(x,max=120){return typeof x==='string'?x.trim().slice(0,max):'';}
function prune(){for(const [id,u] of uploads){if(Date.now()-u.created>60*60*1000&&!u.orderId)uploads.delete(id);}}
const pruneTimer=setInterval(prune,5*60*1000);pruneTimer.unref();
app.post('/api/upload',(req,res)=>upload.single('file')(req,res,err=>{
 if(err)return res.status(400).json({error:'Fichier trop volumineux (8 Mo max) ou envoi invalide.'});
 const f=req.file;const fields={name:clean(req.body.name),email:clean(req.body.email),brand:clean(req.body.brand),model:clean(req.body.model),year:clean(req.body.year,8),engine:clean(req.body.engine),ecu:clean(req.body.ecu),notes:clean(req.body.notes,1000)};
 if(!f||!fields.name||!emailRE.test(fields.email)||!fields.brand||!fields.model||!fields.year||!fields.engine)return res.status(400).json({error:'Complétez les champs obligatoires et choisissez un fichier .bin, .ori, .hex ou .zip (8 Mo maximum).'});
 const id=crypto.randomUUID();uploads.set(id,{created:Date.now(),fields,file:{buffer:f.buffer,name:path.basename(f.originalname).slice(0,140),type:'application/octet-stream'},orderId:null});
 res.json({uploadId:id});
}));
async function sendOrderEmail(orderId,o){
 const u=uploads.get(o.uploadId);if(!u)throw Error('Fichier temporaire introuvable');
 const host=process.env.SMTP_HOST,port=Number(process.env.SMTP_PORT||465),user=process.env.SMTP_USER,pass=process.env.SMTP_PASSWORD;
 if(!host||!user||!pass)throw Error('SMTP non configuré');
 const transporter=nodemailer.createTransport({host,port,secure:port===465,auth:{user,pass}});
 const itemNames=o.items.map(id=>prices.get(id)?.name||id).join(', ');
 const f=u.fields;
 const content=['Commande EPC PAYÉE (vérifiée côté serveur)','Référence PayPal : '+orderId,'Montant : '+(o.cents/100).toFixed(2)+' EUR','Prestations : '+itemNames,'','Client : '+f.name,'E-mail : '+f.email,'Marque : '+f.brand,'Modèle : '+f.model,'Année : '+f.year,'Motorisation : '+f.engine,'Calculateur : '+f.ecu,'Remarques : '+f.notes].join('\n');
 await transporter.sendMail({from:user,to:process.env.ORDER_EMAIL||'Engineperformancechiptuning@gmail.com',replyTo:f.email,subject:'[EPC] Commande payée '+orderId,text:content,attachments:[{filename:u.file.name,content:u.file.buffer,contentType:u.file.type}]});
 o.emailed=true;uploads.delete(o.uploadId);
}

app.get('/api/config',(req,res)=>res.json({clientId:process.env.PAYPAL_CLIENT_ID||'',mode}));
app.post('/api/orders',async(req,res)=>{try{const c=cart(req.body.items);const u=uploads.get(req.body.uploadId);if(!u||u.orderId||Date.now()-u.created>60*60*1000) return res.status(400).json({error:'Fichier absent ou expiré : recommencez le téléversement.'});const order=await paypal('/v2/checkout/orders','POST',{intent:'CAPTURE',purchase_units:[{description:'Prestations ECU EPC',amount:{currency_code:'EUR',value:(c.cents/100).toFixed(2)}}]});if(!order.id)throw Error('Commande PayPal sans identifiant');orders.set(order.id,{items:c.items.map(x=>x.id),cents:c.cents,status:'CREATED',uploadId:req.body.uploadId,emailed:false});u.orderId=order.id;res.json({id:order.id});}catch(e){console.error(e.message);res.status(400).json({error:'Impossible de créer la commande. Vérifiez le panier et la configuration PayPal.'});}});
app.post('/api/orders/:id/capture',async(req,res)=>{try{const o=orders.get(req.params.id);if(!o) return res.status(404).json({error:'Commande inconnue'});if(o.status==='COMPLETED'){if(!o.emailed){try{await sendOrderEmail(req.params.id,o)}catch(e){console.error('EMAIL:',e.message);return res.json({status:'COMPLETED',emailSent:false,orderId:req.params.id})}}return res.json({status:'COMPLETED',emailSent:true,orderId:req.params.id});}const result=await paypal('/v2/checkout/orders/'+encodeURIComponent(req.params.id)+'/capture','POST');const captures=result.purchase_units?.flatMap(u=>u.payments?.captures||[])||[];const valid=result.status==='COMPLETED'&&captures.some(c=>c.status==='COMPLETED'&&c.amount?.currency_code==='EUR'&&Math.round(Number(c.amount.value)*100)===o.cents);if(!valid)return res.status(409).json({error:'Paiement non confirmé'});o.status='COMPLETED';let emailSent=false;try {
  sendOrderEmail(req.params.id).catch(e => {
    console.error('EMAIL:', e.message);
  });
  emailSent = false;
}}console.log('PAIEMENT CONFIRMÉ',req.params.id,o.items,o.cents);res.json({status:'COMPLETED',emailSent,orderId:req.params.id});}catch(e){console.error(e.message);res.status(502).json({error:'Capture non confirmée. Contactez EPC avant de réessayer.'});}});
app.listen(process.env.PORT||3000,()=>console.log('EPC prêt : http://localhost:'+(process.env.PORT||3000)+' ('+mode+')'));
