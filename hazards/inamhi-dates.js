// Narrow Spanish bulletin grammar. No network, guessed current year or rollover
// of omitted months. Original strings remain separate from normalized tokens.
export const months=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const zone='America/Guayaquil';
const localFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function localTime(day,month,year,hour,minute='00') {
  const values=[year,months.indexOf(String(month).toLowerCase())+1,day,hour,minute].map(Number);
  const [y,m,d,h,min]=values;
  if(!values.every(Number.isInteger)||y<2000||y>2099||m<1||d<1||h<0||h>23||min<0||min>59)return null;
  // Modern mainland Ecuador is UTC-05. Confirm against the named IANA zone;
  // don't silently apply it if the time zone database disagrees.
  const ms=Date.UTC(y,m-1,d,h,min)+5*3600000;
  const parts=Object.fromEntries(localFormatter.formatToParts(ms).map(p=>[p.type,p.value]));
  if(['year','month','day','hour','minute'].some((key,i)=>Number(parts[key])!==values[i]))return null;
  return new Date(ms).toISOString();
}
export function normalizeDateText(text) {
  let result=text.normalize('NFC').toLowerCase();
  // PDF line/item fragments inside known month names only. Arbitrary words and
  // neighbouring numbers are never globally concatenated.
  for(const month of months) result=result.replace(new RegExp(`\\b${[...month].join('\\s*')}\\b`,'gu'),month);
  return result.replace(/\s+/g,' ').trim();
}
const small='(\\d(?:\\s*\\d)?)',year='(\\d(?:\\s*\\d){3})';
const time=`${small}\\s*[:h]\\s*(\\d\\s*\\d)`;
const date=`${small}(?:\\s+de\\s+(${months.join('|')}))?(?:\\s+de\\s+${year})?`;
const timeFirst=new RegExp(`^(?:las?\\s+)?${time}(?:\\s+horas)?\\s+(?:del?|el)\\s+${date}$`,'u');
const dateFirst=new RegExp(`^(?:del?|el)\\s+${date}\\s+a\\s+las?\\s+${time}(?:\\s+horas)?$`,'u');
const numeric=value=>value===undefined?null:Number(value.replace(/\s/g,''));
function endpoint(text) {
  let m=text.match(timeFirst);
  if(m)return {hour:numeric(m[1]),minute:numeric(m[2]),day:numeric(m[3]),month:m[4]?months.indexOf(m[4])+1:null,year:numeric(m[5])};
  m=text.match(dateFirst);
  return m?{day:numeric(m[1]),month:m[2]?months.indexOf(m[2])+1:null,year:numeric(m[3]),hour:numeric(m[4]),minute:numeric(m[5])}:null;
}
export function parseInamhiValidity(text) {
  const marker=/Vigencia\s*:/giu;
  const labels=[...text.matchAll(marker)];
  const result={validFrom:null,validTo:null,originalValidityText:null,timeInferenceRules:[],validityParseStatus:'missing'};
  if(!labels.length)return result;
  const label=labels[0],tail=text.slice(label.index+label[0].length);
  const segment=tail.split(/\b(?:NIVEL\s+(?:DE\s+)?AMENAZA|FEN[ÓO]MENO|ZONAS\s+AFECTADAS|DESCRIPCI[ÓO]N)\s*:/iu)[0];
  const raw=segment.trim();
  result.originalValidityText=(label[0]+segment).trimEnd().slice(0,2000);
  result.validityParseStatus='ambiguous_or_invalid';
  if(labels.length!==1||raw.length>2000)return result;
  const expression=normalizeDateText(raw).replace(/[.;]$/,'').trim();
  const range=expression.match(/^desde\s+(.+?)\s+hasta\s+(.+)$/u);
  if(!range)return result;
  const start=endpoint(range[1]),end=endpoint(range[2]);
  if(!start||!end||(!start.month&&!end.month)||(!start.year&&!end.year))return result;
  const rules=[];
  if(!start.month){start.month=end.month;rules.push('start_month_shared_with_end_no_rollover');}
  if(!end.month){end.month=start.month;rules.push('end_month_shared_with_start_no_rollover');}
  if(!start.year) {
    start.year=end.year;
    if(start.month===12&&end.month===1){start.year--;rules.push('explicit_december_january_previous_start_year');}
    else rules.push('start_year_shared_with_end');
  } else if(!end.year) {
    end.year=start.year;
    if(start.month===12&&end.month===1){end.year++;rules.push('explicit_december_january_next_end_year');}
    else rules.push('end_year_shared_with_start');
  }
  const convert=p=>localTime(p.day,months[p.month-1],p.year,p.hour,p.minute);
  const from=convert(start),to=convert(end),duration=Date.parse(to)-Date.parse(from);
  // Shared fields describe a single short bulletin window, not an inferred
  // almost-year-long range. Longer fully explicit windows remain explicit.
  if(!from||!to||duration<=0||(rules.length&&duration>31*86400000))return result;
  return {...result,validFrom:from,validTo:to,timeInferenceRules:rules,validityParseStatus:'parsed'};
}
