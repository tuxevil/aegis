import fs from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const schema=JSON.parse(fs.readFileSync(new URL("../docs/contracts/source-envelope.v1.schema.json",import.meta.url),"utf8"));
const ajv=new Ajv2020({strict:false,allErrors:true});
addFormats(ajv);
const validate=ajv.compile(schema);
const text={type:"string",minLength:1,maxLength:2000};
const nullableText={type:["string","null"],maxLength:2000};
const detailSchemas={
  official_warning:{type:"object",additionalProperties:false,required:["bulletinNumber","authority","sourceRiskLevel","phenomena","areasMentioned","mapReviewed"],properties:{
    bulletinNumber:{type:["integer","null"],minimum:1},authority:{const:"INAMHI"},sourceRiskLevel:nullableText,
    phenomena:{type:"array",items:text,maxItems:20},areasMentioned:{type:"array",items:text,maxItems:100},mapReviewed:{const:false}}},
  static_exposure:{type:"object",additionalProperties:false,required:["features","exceededTransferLimit","sourceCrs","geometryIncluded"],properties:{
    features:{type:"array",maxItems:2000,items:{type:"object",additionalProperties:false,required:["objectId","categoryRaw","cantonCode","cantonName","hazardRaw"],properties:{
      objectId:{type:["integer","null"]},categoryRaw:nullableText,cantonCode:nullableText,cantonName:nullableText,hazardRaw:nullableText}}},
    exceededTransferLimit:{type:"boolean"},sourceCrs:{type:["integer","null"]},geometryIncluded:{const:false}}},
  forecast_run:{type:"object",additionalProperties:false,required:["providerModel","runInitializedAt","time","precipitationMm","unit"],properties:{
    providerModel:nullableText,runInitializedAt:{type:"string",format:"date-time"},unit:{const:"mm"},
    time:{type:"array",minItems:1,maxItems:240,items:{type:"string",format:"date-time"}},
    precipitationMm:{type:"array",minItems:1,maxItems:240,items:{type:["number","null"],minimum:0}}}},
};
const validators=Object.fromEntries(Object.entries(detailSchemas).map(([kind,s])=>[kind,ajv.compile(s)]));
export function validateEnvelope(envelope) {
  if(!validate(envelope) || !validators[envelope.kind]?.(envelope.details)) throw new Error("invalid_source_envelope");
  if(envelope.kind==="forecast_run" && envelope.details.time.length!==envelope.details.precipitationMm.length)
    throw new Error("invalid_source_envelope");
  return envelope;
}
