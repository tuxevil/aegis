import Ajv from 'ajv';
import {utcMillis} from './time.js';
export const territorialPolicyVersion='territorial-evidence-1';
const text={type:'string',minLength:1,maxLength:1000};
const nullableText={type:['string','null'],minLength:1,maxLength:1000};
const schema={type:'object',additionalProperties:false,required:['captureId','sha256','bulletinNumber','parserVersion','evidenceType','location','fragmentRef','territory','officialClassification','method','reviewerId','interpretedAt','limitations','verification','supersedes','cartography'],properties:{
 captureId:{type:'string',pattern:'^[a-zA-Z0-9._-]{1,128}$'},sha256:{type:'string',pattern:'^[a-f0-9]{64}$'},bulletinNumber:{type:'integer',minimum:1},parserVersion:text,
 evidenceType:{enum:['mention','explicit_text_coverage','verified_map_coverage','partial_coverage','unknown_coverage']},
 location:{type:'object',additionalProperties:false,required:['page','region'],properties:{page:{type:'integer',minimum:1,maximum:5},region:text}},
 fragmentRef:text,territory:{type:'object',additionalProperties:false,required:['name','resolution','extent'],properties:{name:text,resolution:{enum:['province','canton','region','unknown']},extent:{enum:['whole','partial','unknown']}}},
 officialClassification:nullableText,method:{enum:['automatic','human_annotation','validated_review']},reviewerId:{type:['string','null'],pattern:'^[a-zA-Z0-9._-]{2,80}$'},interpretedAt:text,
 limitations:{type:'array',minItems:1,maxItems:20,items:text},verification:{enum:['unverified','ambiguous','verified','rejected']},supersedes:{type:['string','null'],pattern:'^[a-f0-9-]{36}$'},
 cartography:{type:['object','null'],additionalProperties:false,required:['legendVerified','georeferenced','crs','boundaryVersion','geometryRef'],properties:{legendVerified:{type:'boolean'},georeferenced:{type:'boolean'},crs:nullableText,boundaryVersion:nullableText,geometryRef:nullableText}}
}};
const check=new Ajv({strict:false}).compile(schema);
const safe={publicationBlocked:true,alertsPublishEnabled:false,dispatchMode:'DRY_RUN'};
export function validateTerritorialInput(input,records) {
 if(!check(input)||JSON.stringify(input).length>16384)throw Error('invalid_territorial_evidence');
 const capture=records.find(r=>r.id===input.captureId),e=capture?.envelope;
 if(!e||e.kind!=='official_warning'||input.sha256!==capture.sha256||input.bulletinNumber!==e.details.bulletinNumber||input.parserVersion!==e.quality.parserVersion||
 !Number.isFinite(utcMillis(capture.processedAt))||!Number.isFinite(utcMillis(input.interpretedAt))||utcMillis(input.interpretedAt)<utcMillis(capture.processedAt))throw Error('territorial_provenance_mismatch');
 if((input.method==='automatic'&&input.reviewerId!==null)||(input.method!=='automatic'&&!input.reviewerId))throw Error('territorial_reviewer_required');
 if(input.verification==='verified'&&(input.method!=='validated_review'||!input.supersedes))throw Error('territorial_validation_required');
 if(input.method==='validated_review'&&(!input.supersedes||!['verified','rejected','ambiguous'].includes(input.verification)))throw Error('territorial_validation_required');
 if(input.verification==='verified') {
   if(!['explicit_text_coverage','verified_map_coverage'].includes(input.evidenceType)||input.territory.extent!=='whole'||!['province','canton'].includes(input.territory.resolution))throw Error('territorial_coverage_not_verified');
   if(input.evidenceType==='verified_map_coverage'&&(!input.cartography?.legendVerified||!input.cartography.georeferenced||!input.cartography.crs||!input.cartography.boundaryVersion||!input.cartography.geometryRef))throw Error('territorial_cartography_unverified');
 }
 return structuredClone(input);
}
export function validateTerritorialReviews(reviews,records) {
 if(!Array.isArray(reviews)||reviews.length>1000)throw Error('territorial_capacity');
 const seen=new Map();
 for(const r of reviews) {
   const {version,id,sequence,recordedAt,publicationBlocked,alertsPublishEnabled,dispatchMode,...input}=r;
   validateTerritorialInput(input,records);
   if(version!==1||!/^[a-f0-9-]{36}$/.test(id)||seen.has(id)||sequence!==seen.size+1||!Number.isFinite(utcMillis(recordedAt))||utcMillis(recordedAt)<utcMillis(input.interpretedAt)||publicationBlocked!==true||alertsPublishEnabled!==false||dispatchMode!=='DRY_RUN')throw Error('invalid_territorial_history');
   if(input.supersedes) {
     const parent=seen.get(input.supersedes);
     if(!parent||parent.captureId!==input.captureId||(parent.territory.name!==input.territory.name||parent.territory.resolution!==input.territory.resolution)||utcMillis(parent.recordedAt)>utcMillis(recordedAt))throw Error('invalid_territorial_revision');
     if(input.verification==='verified'&&parent.reviewerId===input.reviewerId)throw Error('independent_territorial_review_required');
   }
   seen.set(id,r);
 }
 return reviews;
}
function rootCapture(record,records) {
 const seen=new Set();let r=record;
 while(r?.captureRef) {if(seen.has(r.id))return null;seen.add(r.id);r=records.find(p=>p.id===r.captureRef);}
 return r?.id;
}
const same=(a,b)=>a.normalize('NFC').trim().toLocaleLowerCase('es')===b.normalize('NFC').trim().toLocaleLowerCase('es');
// Review facts are operator assertions, never cryptographic verification of a
// person's authority. Unreviewed notes cannot grant coverage or publication.
export function territorialScope({record,records,reviews,area,asOf}) {
 const e=record.envelope,root=rootCapture(record,records),cutoff=utcMillis(asOf);
 const relevant=reviews.filter(r=>r.sha256===record.sha256&&r.bulletinNumber===e.details.bulletinNumber&&rootCapture(records.find(c=>c.id===r.captureId),records)===root&&
   ((r.territory.resolution==='province'&&same(r.territory.name,area.province))||(r.territory.resolution==='canton'&&same(r.territory.name,area.name))));
 const known=relevant.filter(r=>utcMillis(r.recordedAt)<=cutoff&&utcMillis(r.interpretedAt)<=cutoff),superseded=new Set(known.map(r=>r.supersedes)),active=known.filter(r=>!superseded.has(r.id));
 const explanation={policyVersion:territorialPolicyVersion,reviewIds:active.map(r=>r.id),limitations:active.flatMap(r=>r.limitations),resolution:'unknown',publicationBlocked:true};
 if(active.length) {
   if(active.length>1)return {scope:null,reason:active.every(r=>['unverified','ambiguous'].includes(r.verification))?'territorial_review_unverified':'territorial_reviews_conflict',...explanation};
   const r=active[0];
   if(r.verification!=='verified')return {scope:null,reason:r.verification==='rejected'?'territorial_review_rejected':'territorial_review_unverified',...explanation};
   return {scope:{precision:r.territory.resolution,name:r.territory.name,matching:'validated_territorial_evidence',evidence:{policyVersion:territorialPolicyVersion,reviewId:r.id,captureId:r.captureId,sha256:r.sha256,evidenceType:r.evidenceType,method:r.method,reviewerId:r.reviewerId,interpretedAt:r.interpretedAt,recordedAt:r.recordedAt,location:r.location,officialClassification:r.officialClassification}},...explanation,resolution:r.territory.resolution};
 }
 // New parsers explicitly separate affected lists from incidental names. Older
 // spatial.areaNames alone cannot establish coverage. No city-level escalation.
 const covered=e.details.coveredAreaNames||[];
 if(e.spatial.precision==='province'&&covered.some(n=>same(n,area.province)))return {scope:{precision:'province',name:area.province,matching:'explicit_affected_list',evidence:{policyVersion:territorialPolicyVersion,method:'automatic',parserVersion:e.quality.parserVersion,classification:null}},...explanation,resolution:'province'};
 return {scope:null,reason:'territory_not_supported',...explanation};
}
export {safe as territorialSafeMode};
