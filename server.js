const crypto=require('crypto');
require('dotenv').config();
const express=require('express');
const path=require('path');
const catalog=require('./catalog.json');
const app=express();app.disable('x-powered-by');app.use(express.json({limit:'12kb'}));
app.use(express.static(path.join(__dirname,'public'),{extensions:['html']}));
const prices=new Map(catalog.map(x=>[x.id,x]));
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
app.get('/api/config',(req,res)=>res.json({clientId:process.env.PAYPAL_CLIENT_ID||'',mode}));
app.post('/api/orders',async(req,res)=>{try{const c=cart(req.body.items);const order=await paypal('/v2/checkout/orders','POST',{intent:'CAPTURE',purchase_units:[{description:'Prestations ECU EPC',amount:{currency_code:'EUR',value:(c.cents/100).toFixed(2)}}]});if(!order.id)throw Error('Commande PayPal sans identifiant');orders.set(order.id,{items:c.items.map(x=>x.id),cents:c.cents,status:'CREATED'});res.json({id:order.id});}catch(e){console.error(e.message);res.status(400).json({error:'Impossible de créer la commande. Vérifiez le panier et la configuration PayPal.'});}});
app.post('/api/orders/:id/capture',async(req,res)=>{try{const o=orders.get(req.params.id);if(!o) return res.status(404).json({error:'Commande inconnue'});if(o.status==='COMPLETED')return res.json({status:'COMPLETED'});const result=await paypal('/v2/checkout/orders/'+encodeURIComponent(req.params.id)+'/capture','POST');const captures=result.purchase_units?.flatMap(u=>u.payments?.captures||[])||[];const valid=result.status==='COMPLETED'&&captures.some(c=>c.status==='COMPLETED'&&c.amount?.currency_code==='EUR'&&Math.round(Number(c.amount.value)*100)===o.cents);if(!valid)return res.status(409).json({error:'Paiement non confirmé'});o.status='COMPLETED';console.log('PAIEMENT CONFIRMÉ',req.params.id,o.items,o.cents);res.json({status:'COMPLETED',orderId:req.params.id});}catch(e){console.error(e.message);res.status(502).json({error:'Capture non confirmée. Contactez EPC avant de réessayer.'});}});
app.listen(process.env.PORT||3000,()=>console.log('EPC prêt : http://localhost:'+(process.env.PORT||3000)+' ('+mode+')'));
