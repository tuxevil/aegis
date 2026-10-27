import fs from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {utcMillis} from "./time.js";

const schema=JSON.parse(fs.readFileSync(new URL("../docs/contracts/source-envelope.v1.schema.json",import.meta.url),"utf8"));
const ajv=new Ajv2020({strict:false,allErrors:true});
addFormats(ajv);
const validate=ajv.compile(schema);
const text={type:"string",minLength:1,maxLength:2000};
const nullableText={type:["string","null"],maxLength:2000};
const position={type:"array",minItems:2,maxItems:2,prefixItems:[{type:"number",minimum:-180,maximum:180},{type:"number",minimum:-90,maximum:90}],items:false};
const ring={type:"array",minItems:4,maxItems:100000,items:position};
const polygon={type:"array",minItems:1,maxItems:256,items:ring};
const geometry={oneOf:[
  {type:"object",additionalProperties:false,required:["type","coordinates"],properties:{type:{const:"Polygon"},coordinates:polygon}},
  {type:"object",additionalProperties:false,required:["type","coordinates"],properties:{type:{const:"MultiPolygon"},coordinates:{type:"array",minItems:1,maxItems:256,items:polygon}}},
]};
const detailSchemas={
  observation:{type:"object",additionalProperties:false,required:["measuredAt","rainRateMmHr","rainDailyMm","scope","upstreamFailed"],properties:{
    measuredAt:{type:["string","null"],format:"date-time",pattern:"Z$"},rainRateMmHr:{type:["number","null"],minimum:0},
    rainDailyMm:{type:["number","null"],minimum:0},scope:{const:"single_station"},upstreamFailed:{type:"boolean"}}},
  official_warning:{type:"object",additionalProperties:false,required:["bulletinNumber","authority","sourceRiskLevel","phenomena","areasMentioned","mapReviewed"],properties:{
    bulletinNumber:{type:["integer","null"],minimum:1},authority:{const:"INAMHI"},sourceRiskLevel:nullableText,
    phenomena:{type:"array",items:text,maxItems:20},areasMentioned:{type:"array",items:text,maxItems:100},mapReviewed:{const:false}}},
  static_exposure:{type:"object",additionalProperties:false,required:["features","exceededTransferLimit","sourceCrs","geometryIncluded"],properties:{
    features:{type:"array",maxItems:2000,items:{type:"object",additionalProperties:false,required:["objectId","categoryRaw","cantonCode","cantonName","hazardRaw"],properties:{
      objectId:{type:["integer","null"]},categoryRaw:nullableText,cantonCode:nullableText,cantonName:nullableText,hazardRaw:nullableText,geometry}}},
    exceededTransferLimit:{type:["boolean","null"]},sourceCrs:{type:["integer","null"]},geometryIncluded:{type:"boolean"},
    captureRole:{enum:["metadata","count","ids","features"]},targetCrs:{const:4326},transformEngine:{const:"proj4@2.22.0"}}},
  forecast_run:{type:"object",additionalProperties:false,required:["providerModel","runInitializedAt","time","precipitationMm","unit"],properties:{
    providerModel:nullableText,modelIdentityBasis:{enum:["response_field","explicit_request","unknown"]},runInitializedAt:{type:"string",format:"date-time",pattern:"Z$"},unit:{const:"mm"},
    time:{type:"array",minItems:1,maxItems:240,items:{type:"string",format:"date-time",pattern:"Z$"}},
    precipitationMm:{type:"array",minItems:1,maxItems:240,items:{type:["number","null"],minimum:0}}}},
};
const validators=Object.fromEntries(Object.entries(detailSchemas).map(([kind,s])=>[kind,ajv.compile(s)]));
export function validateEnvelope(envelope) {
  if(!validate(envelope) || !validators[envelope.kind]?.(envelope.details)) throw new Error("invalid_source_envelope");
  if(envelope.kind==="forecast_run" && envelope.details.time.length!==envelope.details.precipitationMm.length)
    throw new Error("invalid_source_envelope");
  if(envelope.kind==="forecast_run" && (!Number.isFinite(utcMillis(envelope.details.runInitializedAt))||utcMillis(envelope.details.runInitializedAt)!==utcMillis(envelope.time.runInitializedAt)))
    throw new Error("invalid_source_envelope");
  if(envelope.kind==="static_exposure" && envelope.details.features.some(f=>Boolean(f.geometry)!==envelope.details.geometryIncluded))
    throw new Error("invalid_source_envelope");
  return envelope;
}
