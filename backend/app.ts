import express from 'express';
import {validateWarrantyData} from '../src/validation.ts';
import {writeWarrantyToGoogleSheets,getServiceAccountDetails,TARGET_SPREADSHEET_ID,type WarrantyEntry,type SheetsResult} from '../src/services/sheetsServer.ts';
export function createApp(writer:(entry:WarrantyEntry,id?:string)=>Promise<SheetsResult>=writeWarrantyToGoogleSheets){
 const app=express();app.disable('x-powered-by');app.use(express.json({limit:'8kb'}));
 app.use('/api',(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()});
 app.get('/api/health',(_req,res)=>res.json({success:true,service:'dary-google-sheets',version:'1.0.1'}));
 app.get('/api/sheets-status',async(_req,res)=>{
  try{res.json({success:true,spreadsheetId:process.env.GOOGLE_SHEETS_ID||TARGET_SPREADSHEET_ID,...await getServiceAccountDetails()})}
  catch(e){res.status(503).json({success:false,message:e instanceof Error?e.message:'Identité indisponible'})}
 });
 // Serialise submissions in this process; persistent reference checks also cover sequential retries after restart.
 let queue:Promise<unknown>=Promise.resolve();
 app.post('/api/garantie',async(req,res)=>{
  if(req.headers['sec-fetch-site']==='cross-site'){res.status(403).json({success:false,message:'Requête non autorisée.'});return}
  const valid=validateWarrantyData(req.body);
  if(!valid.isValid||!valid.sanitizedData){res.status(400).json({success:false,message:'Vérifiez les informations du formulaire.',errors:valid.errors});return}
  const id=req.body.id;
  if(typeof id!=='string'||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(id)){res.status(400).json({success:false,message:'Référence de requête invalide. Rechargez la page.'});return}
  const p=valid.sanitizedData,reference='DRY-'+id,createdAt=new Date().toISOString();
  const entry:WarrantyEntry={date:createdAt,reference,nom:p.nom,prenom:p.prenom,telephone:p.telephone,email:p.email,ville:p.ville,produit:p.type==='matelas'?'Matelas':'Salon',modele:p.modele||'',dimensions:p.dimensions||'',consentement:'Oui'};
  try{
   const task=queue.then(()=>writer(entry,process.env.GOOGLE_SHEETS_ID||TARGET_SPREADSHEET_ID));queue=task.catch(()=>{});const result=await task;
   if(!result.success){res.status(503).json({success:false,message:result.error||'Google Sheets indisponible.'});return}
   res.status(result.duplicate?200:201).json({success:true,reference,data:{...p,reference,createdAt},sheetTitle:result.sheetTitle});
  }catch{res.status(503).json({success:false,message:'Enregistrement indisponible. Vos informations restent dans le formulaire.'})}
 });
 app.use('/api',(_req,res)=>res.status(404).json({success:false,message:'Route API introuvable.'}));
 app.use((error:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(error.status===413?413:400).json({success:false,message:'Requête invalide ou trop volumineuse.'}));
 return app;
}
export default createApp();
