/* CC SafeGuard Live: secure Supabase browser adapter.
 * Only the publishable/anon key belongs in the browser. Never place a service-role key here.
 */
(function(){
  "use strict";
  var cfg=window.CCSG_SUPABASE_CONFIG;
  if(!cfg||!cfg.url||!cfg.anonKey||String(cfg.url).includes("YOUR_PROJECT_ID")||String(cfg.anonKey).includes("YOUR_SUPABASE")){
    console.error("CC SafeGuard: isi URL dan publishable key pada supabase-config.js.");
    return;
  }
  if(!window.supabase||!window.supabase.createClient){
    console.error("CC SafeGuard: Supabase JS SDK belum dimuat.");
    return;
  }
  var client=window.supabase.createClient(cfg.url,cfg.anonKey,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
  });
  var EMAIL_DOMAIN="@accounts.ccsafeguard.local";
  var BUCKET="ccsg-report-photos";
  var MAX_PHOTO_BYTES=5*1024*1024;
  var allowedTypes=["image/jpeg","image/png","image/webp"];

  async function currentProfile(){
    var authResult=await client.auth.getUser();
    if(authResult.error||!authResult.data.user)return null;
    var result=await client.from("profiles")
      .select("id,username,display_name,role,is_active")
      .eq("id",authResult.data.user.id).maybeSingle();
    if(result.error)throw result.error;
    if(!result.data||result.data.is_active!==true){
      await client.auth.signOut();
      if(result.data&&!result.data.is_active)throw new Error("Akun dinonaktifkan. Hubungi Admin.");
      return null;
    }
    return Object.assign({},result.data,{authUser:authResult.data.user});
  }
  async function login(username,password){
    var clean=String(username||"").trim().toLowerCase();
    if(!clean||!password)throw new Error("Username dan password wajib diisi.");
    var result=await client.auth.signInWithPassword({email:clean+EMAIL_DOMAIN,password:password});
    if(result.error)throw new Error("Username atau password tidak cocok.");
    var profile=await currentProfile();
    if(!profile){await client.auth.signOut();throw new Error("Profil akun belum terdaftar atau tidak aktif. Hubungi Admin.");}
    return {session:result.data.session,profile:profile};
  }
  async function logout(){var r=await client.auth.signOut();if(r.error)throw r.error;}
  async function adminUserAction(payload){
    var result=await client.functions.invoke("admin-manage-users",{body:payload});
    if(result.error)throw new Error(result.error.message||"Aksi Admin gagal.");
    if(result.data&&result.data.error)throw new Error(result.data.error);
    return result.data;
  }
  async function createReport(fields){
    var profile=await currentProfile();if(!profile)throw new Error("Sesi login berakhir. Silakan masuk kembali.");
    var category=fields.category;
    if((profile.role==="committee"&&category!=="general")||(profile.role==="clinic"&&category!=="medical")||!["general","medical"].includes(category))throw new Error("Kategori laporan tidak sesuai hak akses akun.");
    var code="CC-"+new Date().toISOString().replace(/[-:.TZ]/g,"").slice(0,14)+"-"+Math.random().toString(36).slice(2,6).toUpperCase();
    var payload={report_code:code,category:category,title:String(fields.title||"").trim(),reporter_name:String(fields.reporter_name||"").trim(),location:String(fields.location||"").trim()||null,priority:fields.priority||"Sedang",status:"Perlu verifikasi",description:String(fields.description||"").trim(),created_by:profile.id};
    var result=await client.from("reports").insert(payload).select("*").single();
    if(result.error)throw result.error;
    return result.data;
  }
  async function updateReport(reportId,changes){
    var safe=Object.assign({},changes,{updated_at:new Date().toISOString()});
    var result=await client.from("reports").update(safe).eq("id",reportId).select("*").single();
    if(result.error)throw result.error;
    return result.data;
  }
  async function listReports(){
    var result=await client.from("reports").select("*").order("created_at",{ascending:false}).limit(500);
    if(result.error)throw result.error;
    return result.data||[];
  }
  async function uploadReportPhoto(reportId,file){
    var profile=await currentProfile();if(!profile)throw new Error("Silakan login kembali.");
    if(!file||allowedTypes.indexOf(file.type)<0)throw new Error("Foto harus JPG, PNG, atau WebP.");
    if(file.size<=0||file.size>MAX_PHOTO_BYTES)throw new Error("Ukuran setiap foto maksimal 5 MB.");
    var ext=file.type==="image/jpeg"?"jpg":file.type.split("/")[1];
    var path=reportId+"/"+crypto.randomUUID()+"."+ext;
    var upload=await client.storage.from(BUCKET).upload(path,file,{contentType:file.type,upsert:false});
    if(upload.error)throw upload.error;
    var meta=await client.from("report_photos").insert({report_id:reportId,storage_path:path,file_name:file.name,content_type:file.type,size_bytes:file.size,uploaded_by:profile.id}).select("*").single();
    if(meta.error){await client.storage.from(BUCKET).remove([path]);throw meta.error;}
    return meta.data;
  }
  async function listReportPhotos(reportId){
    var result=await client.from("report_photos").select("id,storage_path,file_name,content_type,size_bytes,created_at").eq("report_id",reportId).order("created_at",{ascending:true});
    if(result.error)throw result.error;
    return Promise.all((result.data||[]).map(async function(photo){
      var signed=await client.storage.from(BUCKET).createSignedUrl(photo.storage_path,300);
      if(signed.error)throw signed.error;
      return Object.assign({},photo,{url:signed.data.signedUrl});
    }));
  }
  async function listActivity(){
    var result=await client.from("activity_log").select("id,actor_name,action,target_username,result,details,report_code,category,created_at").order("created_at",{ascending:false}).limit(100);
    if(result.error)throw result.error;
    return result.data||[];
  }
  function subscribeReportChanges(callback){
    return client.channel("ccsg-live-reports")
      .on("postgres_changes",{event:"*",schema:"public",table:"reports"},callback)
      .on("postgres_changes",{event:"*",schema:"public",table:"report_photos"},callback)
      .subscribe();
  }
  async function removeReportSubscription(channel){
    if(channel)await client.removeChannel(channel);
  }
  window.CCSG=Object.freeze({client:client,currentProfile:currentProfile,login:login,logout:logout,adminUserAction:adminUserAction,createReport:createReport,updateReport:updateReport,listReports:listReports,uploadReportPhoto:uploadReportPhoto,listReportPhotos:listReportPhotos,listActivity:listActivity,subscribeReportChanges:subscribeReportChanges,removeReportSubscription:removeReportSubscription});
})();
