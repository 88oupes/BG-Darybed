import {GoogleAuth} from 'google-auth-library';
export const TARGET_SPREADSHEET_ID='148zAkd_M-LR9NpQmq0rP4BEeMT9lGqx2qCwX4a2TKug';
export const EXPECTED_HEADERS=['Date','Référence','Nom','Prénom','Téléphone','E-mail','Ville','Produit','Modèle','Dimensions','Consentement'];
export interface WarrantyEntry{date:string;reference:string;nom:string;prenom:string;telephone:string;email:string;ville:string;produit:string;modele:string;dimensions:string;consentement:string}
export interface SheetsResult{success:boolean;sheetTitle?:string;updatedRange?:string;error?:string;duplicate?:boolean}
function auth(){
 let credentials;
 if(process.env.GOOGLE_SERVICE_ACCOUNT_JSON){
  try{credentials=JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)}catch{throw new Error('Le secret GOOGLE_SERVICE_ACCOUNT_JSON contient un JSON invalide.')}
  if(!credentials.client_email||!credentials.private_key)throw new Error('Le secret Google doit contenir client_email et private_key.');
 }
 return new GoogleAuth({credentials,scopes:['https://www.googleapis.com/auth/spreadsheets']});
}
export async function getServiceAccountDetails(){
 const google=auth();
 try{const credentials=await google.getCredentials();return {email:credentials.client_email||'',projectId:await google.getProjectId().catch(()=>''),configured:!!credentials.client_email}}
 catch{throw new Error('Identité Google non configurée. Sur Google Cloud, autorisez le compte du service. Hors Google Cloud, configurez GOOGLE_SERVICE_ACCOUNT_JSON dans les secrets du serveur.')}
}
export function makeSheetsWriter(getToken:()=>Promise<string>,request:typeof fetch=fetch){
 return async function write(entry:WarrantyEntry,spreadsheetId=TARGET_SPREADSHEET_ID):Promise<SheetsResult>{
  try{
   const token=await getToken();
   const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
   const base=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
   async function call(url:string,options:RequestInit={}){
    const response=await request(url,{...options,headers,signal:AbortSignal.timeout(12000)});
    const body:any=await response.json().catch(()=>({}));
    if(!response.ok){const msg=body.error?.message||`Erreur Google Sheets (${response.status})`;throw new Error(response.status===403?`Accès Google Sheets refusé : activez Google Sheets API et partagez le fichier avec le compte de service comme Éditeur. ${msg}`:msg)}
    return body;
   }
   const metadata=await call(base+'?fields=sheets.properties');
   const target=metadata.sheets?.find((s:any)=>s.properties?.sheetId===0);
   if(!target)throw new Error('L’onglet sheetId=0 est introuvable. Aucun autre onglet n’a été modifié.');
   const title:string=target.properties.title;
   const quoted="'"+title.replaceAll("'","''")+"'";
   const range=(r:string)=>base+'/values/'+encodeURIComponent(quoted+'!'+r);
   const top=await call(range('A1:K1'));
   if(!top.values?.[0]?.some((v:unknown)=>String(v).trim())){
    const existing=await call(range('A:K'));
    if(existing.values?.some((row:unknown[])=>row.some(v=>String(v).trim())))throw new Error('Cet onglet contient des données sans les en-têtes attendus. Rien n’a été écrasé.');
    await call(range('A1:K1')+'?valueInputOption=RAW',{method:'PUT',body:JSON.stringify({values:[EXPECTED_HEADERS]})});
   }else{
    const normalize=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[-\s]/g,'');
    if(EXPECTED_HEADERS.some((h,i)=>normalize(String(top.values[0][i]||''))!==normalize(h)))throw new Error('Les colonnes de l’onglet ne correspondent pas : '+EXPECTED_HEADERS.join(' | ')+'. Rien n’a été écrasé.');
   }
   const refs=await call(range('B2:B'));
   if(refs.values?.some((row:string[])=>row[0]===entry.reference))return {success:true,sheetTitle:title,duplicate:true};
   const row=[entry.date,entry.reference,entry.nom,entry.prenom,entry.telephone,entry.email,entry.ville,entry.produit,entry.modele,entry.dimensions,entry.consentement];
   const result=await call(range('A:K')+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',{method:'POST',body:JSON.stringify({values:[row]})});
   if(result.updates?.updatedRows!==1||!result.updates?.updatedRange)throw new Error('Google Sheets n’a pas confirmé l’ajout du bulletin.');
   return {success:true,sheetTitle:title,updatedRange:result.updates.updatedRange};
  }catch(error){return {success:false,error:error instanceof Error?error.message:'Écriture indisponible'}}
 };
}
export const writeWarrantyToGoogleSheets=makeSheetsWriter(async()=>{
 try{const client=await auth().getClient();const result=await client.getAccessToken();if(!result.token)throw new Error('Jeton manquant');return result.token}
 catch{throw new Error('Impossible de s’authentifier auprès de Google. Configurez l’identité serveur ou le secret GOOGLE_SERVICE_ACCOUNT_JSON, puis partagez le tableau avec ce compte.')}
});
