const string={type:"string"};
const nullableString={type:["string","null"]};
const closed=properties=>({type:"object",additionalProperties:false,properties});
const items={
  sources:closed({sourceId:string,title:string,owner:string,sourceUrl:string,licensingStatus:string,coverageStatus:string,pollingEnabled:{type:"boolean"}}),
  health:closed({sourceId:string,status:string,lastRetrievedAt:nullableString,coverageStatus:string}),
  areas:closed({id:string,dpaCode:string,name:string,province:string,precision:string,codeSource:string,codeStatus:string,
    boundaryVersion:nullableString,geometry:{type:"null"},coverageStatus:string,boundaryStatus:string,limitations:{type:"array",items:string}}),
  observations:closed({}),bulletins:closed({}),
};
export function hazardResponseSchema(collection) {
  return closed({schemaVersion:string,collection:string,generatedAt:string,alertsPublishEnabled:{const:false,type:"boolean"},dispatchMode:{const:"DRY_RUN",type:"string"},
    coverageStatus:string,notice:string,items:{type:"array",items:items[collection]},
    pagination:closed({limit:{type:"integer"},offset:{type:"integer"},total:{type:"integer"},hasMore:{type:"boolean"}})});
}
