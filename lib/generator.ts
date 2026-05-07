export const COUNTRIES = [
  { name: "🇺🇸 United States", dial: "+1", prefixes: ["201","202","203","206","212","213","214","310","312","404","415","424","469","510","512","619","646","650","702","713","718","747","773","786","818","850","929","954","972"], length: 10 },
  { name: "🇬🇧 United Kingdom", dial: "+44", prefixes: ["7400","7700","7800","7900","7401","7500","7501","7502","7503"], length: 10, mobile: true },
  { name: "🇩🇪 Germany", dial: "+49", prefixes: ["151","152","160","162","163","170","171","172","173","174","175","176","177","178","179"], length: 11, mobile: true },
  { name: "🇫🇷 France", dial: "+33", prefixes: ["6","7"], length: 9, mobile: true },
  { name: "🇮🇹 Italy", dial: "+39", prefixes: ["320","328","329","333","335","338","340","345","347","348","349","380","388","389","392","393"], length: 10 },
  { name: "🇪🇸 Spain", dial: "+34", prefixes: ["6","7"], length: 9, mobile: true },
  { name: "🇷🇺 Russia", dial: "+7", prefixes: ["900","901","902","903","904","905","906","908","909","910","911","912","913","914","915","916","917","918","919","920","921","922"], length: 10 },
  { name: "🇨🇳 China", dial: "+86", prefixes: ["130","131","132","133","134","135","136","137","138","139","145","147","150","151","152","153","155","156","157","158","159","166","170","171","172","173","175","176","177","178","180","181","182","183","184","185","186","187","188","189","198","199"], length: 11 },
  { name: "🇮🇳 India", dial: "+91", prefixes: ["6","7","8","9"], length: 10, mobile: true },
  { name: "🇧🇷 Brazil", dial: "+55", prefixes: ["11","21","31","41","51","61","71","81","91"], length: 11 },
  { name: "🇿🇦 South Africa", dial: "+27", prefixes: ["60","61","62","63","64","65","66","67","68","69","71","72","73","74","75","76","78","79","81","82","83","84"], length: 9 },
  { name: "🇳🇬 Nigeria", dial: "+234", prefixes: ["701","702","703","704","705","706","707","708","709","802","803","804","805","806","807","808","809","810","811","812","813","814","815","816","817","818","819","909","908","907","906","905","904","903","902","901"], length: 10 },
  { name: "🇰🇪 Kenya", dial: "+254", prefixes: ["700","701","702","703","704","705","706","707","708","709","710","711","712","713","714","715","720","721","722","723","724","725","726","727","728","729","740","741","742","743","745","746","748","757","758","759","768","769","790","791","792","793","795","796","798","799"], length: 9 },
  { name: "🇪🇬 Egypt", dial: "+20", prefixes: ["100","101","102","103","106","109","110","111","112","114","115","120","121","122","128"], length: 10 },
  { name: "🇬🇭 Ghana", dial: "+233", prefixes: ["20","23","24","25","26","27","28","29","50","54","55","56","57","59"], length: 9 },
  { name: "🇹🇿 Tanzania", dial: "+255", prefixes: ["61","62","65","67","68","69","71","74","75","76","77","78"], length: 9 },
  { name: "🇪🇹 Ethiopia", dial: "+251", prefixes: ["91","92","93","94","95","96","97","98"], length: 9 },
  { name: "🇦🇺 Australia", dial: "+61", prefixes: ["4"], length: 9, mobile: true },
  { name: "🇯🇵 Japan", dial: "+81", prefixes: ["70","80","90"], length: 11 },
  { name: "🇰🇷 South Korea", dial: "+82", prefixes: ["10"], length: 10, mobile: true },
  { name: "🇸🇦 Saudi Arabia", dial: "+966", prefixes: ["50","51","53","54","55","56","57","58","59"], length: 9 },
  { name: "🇦🇪 UAE", dial: "+971", prefixes: ["50","52","54","55","56","58"], length: 9 },
  { name: "🇵🇰 Pakistan", dial: "+92", prefixes: ["300","301","302","303","304","305","306","307","308","309","310","311","312","313","314","315","316","317","318","319","320","321","322","323","324","325","330","331","332","333","334","335","336","340","341","342","343","344","345","346","347","348","349"], length: 10 },
  { name: "🇧🇩 Bangladesh", dial: "+880", prefixes: ["13","14","15","16","17","18","19"], length: 10 },
  { name: "🇮🇩 Indonesia", dial: "+62", prefixes: ["811","812","813","821","822","823","852","853","855","856","857","858","859","877","878","879","881","882","883","895","896","897","898","899"], length: 12 },
  { name: "🇲🇾 Malaysia", dial: "+60", prefixes: ["11","12","13","14","16","17","18","19"], length: 9 },
  { name: "🇵🇭 Philippines", dial: "+63", prefixes: ["905","906","907","908","909","910","911","912","917","918","919","920","921","922","923","924","925","926","927","928","929","930","931","932","933","934","935","936","937","938","939","940","941","942","943","944","945","946","947","948","949","950","955","956","961","963","964","965","966","967","973","974","975","976","977","978","979","989","995","998","999"], length: 10 },
  { name: "🇻🇳 Vietnam", dial: "+84", prefixes: ["32","33","34","35","36","37","38","39","56","58","59","70","76","77","78","79","81","82","83","84","85","86","88","89","90","91","92","93","94","96","97","98"], length: 9 },
  { name: "🇹🇷 Turkey", dial: "+90", prefixes: ["50","53","54","55","56","57","58","59"], length: 10 },
  { name: "🇲🇽 Mexico", dial: "+52", prefixes: ["55","33","81","664","656","614","222","229","442","443"], length: 10 },
  { name: "🇦🇷 Argentina", dial: "+54", prefixes: ["11","221","261","341","351","381","387","388"], length: 10 },
  { name: "🇨🇴 Colombia", dial: "+57", prefixes: ["300","301","302","303","304","305","310","311","312","313","314","315","316","317","318","319","320","321","322","323","324","325"], length: 10 },
  { name: "🇨🇱 Chile", dial: "+56", prefixes: ["9"], length: 9, mobile: true },
  { name: "🇵🇪 Peru", dial: "+51", prefixes: ["9"], length: 9, mobile: true },
  { name: "🇨🇦 Canada", dial: "+1", prefixes: ["204","236","249","250","289","306","343","365","387","403","416","418","431","437","438","450","506","514","519","548","579","581","587","604","613","639","647","672","705","709","742","778","780","782","807","819","825","867","873","902","905"], length: 10 },
  { name: "🇳🇱 Netherlands", dial: "+31", prefixes: ["6"], length: 9, mobile: true },
  { name: "🇧🇪 Belgium", dial: "+32", prefixes: ["47","48","49"], length: 9 },
  { name: "🇵🇱 Poland", dial: "+48", prefixes: ["45","50","51","53","57","60","66","69","72","73","78","79","88"], length: 9 },
  { name: "🇸🇪 Sweden", dial: "+46", prefixes: ["70","72","73","76"], length: 9 },
  { name: "🇳🇴 Norway", dial: "+47", prefixes: ["4","9"], length: 8, mobile: true },
  { name: "🇩🇰 Denmark", dial: "+45", prefixes: ["2","3","4","5","6","7","8","9"], length: 8 },
  { name: "🇫🇮 Finland", dial: "+358", prefixes: ["40","41","42","43","44","45","46","50"], length: 9 },
  { name: "🇨🇭 Switzerland", dial: "+41", prefixes: ["74","75","76","77","78","79"], length: 9 },
  { name: "🇦🇹 Austria", dial: "+43", prefixes: ["650","660","664","676","680","681","688","699","670","671","672","677"], length: 10 },
  { name: "🇵🇹 Portugal", dial: "+351", prefixes: ["91","92","93","96"], length: 9 },
  { name: "🇬🇷 Greece", dial: "+30", prefixes: ["69"], length: 10 },
  { name: "🇨🇿 Czech Republic", dial: "+420", prefixes: ["60","70","72","73","77"], length: 9 },
  { name: "🇭🇺 Hungary", dial: "+36", prefixes: ["20","30","31","70"], length: 9 },
  { name: "🇷🇴 Romania", dial: "+40", prefixes: ["7"], length: 9, mobile: true },
  { name: "🇺🇦 Ukraine", dial: "+380", prefixes: ["50","63","66","67","68","73","91","92","93","94","95","96","97","98","99"], length: 9 },
  { name: "🇮🇱 Israel", dial: "+972", prefixes: ["50","52","53","54","55","56","57","58","59"], length: 9 },
  { name: "🇮🇷 Iran", dial: "+98", prefixes: ["901","910","911","912","913","914","915","916","917","918","919","920","921","930","933","935","936","937","938","939","941","990","991","992","993","994"], length: 10 },
  { name: "🇲🇦 Morocco", dial: "+212", prefixes: ["60","61","62","63","64","65","66","67","68","69"], length: 9 },
  { name: "🇹🇳 Tunisia", dial: "+216", prefixes: ["20","21","22","23","24","25","26","27","28","29","50","51","52","53","54","55","56","57","58","59","90","91","92","93","94","95","96","97","98","99"], length: 8 },
  { name: "🇸🇳 Senegal", dial: "+221", prefixes: ["70","75","76","77","78"], length: 9 },
  { name: "🇨🇲 Cameroon", dial: "+237", prefixes: ["6","7"], length: 9, mobile: true },
  { name: "🇸🇬 Singapore", dial: "+65", prefixes: ["8","9"], length: 8, mobile: true },
  { name: "🇭🇰 Hong Kong", dial: "+852", prefixes: ["5","6","9"], length: 8 },
  { name: "🇹🇼 Taiwan", dial: "+886", prefixes: ["9"], length: 9, mobile: true },
  { name: "🇹🇭 Thailand", dial: "+66", prefixes: ["6","8","9"], length: 9, mobile: true },
  { name: "🇲🇲 Myanmar", dial: "+95", prefixes: ["9"], length: 9, mobile: true },
  { name: "🇰🇭 Cambodia", dial: "+855", prefixes: ["1","6","7","8","9"], length: 8 },
  { name: "🇱🇰 Sri Lanka", dial: "+94", prefixes: ["70","71","72","74","75","76","77","78","79"], length: 9 },
  { name: "🇳🇵 Nepal", dial: "+977", prefixes: ["98","97","96","95"], length: 10 },
  { name: "🇦🇫 Afghanistan", dial: "+93", prefixes: ["70","71","72","73","74","75","76","77","78","79"], length: 9 },
  { name: "🇮🇶 Iraq", dial: "+964", prefixes: ["750","751","770","771","772","773","780","781","782","783","790","791"], length: 10 },
  { name: "🇸🇾 Syria", dial: "+963", prefixes: ["93","94","95","96","99"], length: 9 },
  { name: "🇯🇴 Jordan", dial: "+962", prefixes: ["77","78","79"], length: 9 },
  { name: "🇱🇧 Lebanon", dial: "+961", prefixes: ["3","70","71","76","78","79"], length: 8 },
  { name: "🇰🇼 Kuwait", dial: "+965", prefixes: ["5","6","9"], length: 8 },
  { name: "🇶🇦 Qatar", dial: "+974", prefixes: ["3","5","6","7"], length: 8 },
  { name: "🇧🇭 Bahrain", dial: "+973", prefixes: ["3","6"], length: 8 },
  { name: "🇴🇲 Oman", dial: "+968", prefixes: ["7","9"], length: 8 },
  { name: "🇾🇪 Yemen", dial: "+967", prefixes: ["7"], length: 9, mobile: true },
  { name: "🇱🇾 Libya", dial: "+218", prefixes: ["91","92","93","94","95"], length: 9 },
  { name: "🇸🇩 Sudan", dial: "+249", prefixes: ["9"], length: 9, mobile: true },
  { name: "🇨🇩 DR Congo", dial: "+243", prefixes: ["81","82","83","84","85","89","97","98","99"], length: 9 },
  { name: "🇦🇴 Angola", dial: "+244", prefixes: ["91","92","93","94","99"], length: 9 },
  { name: "🇿🇲 Zambia", dial: "+260", prefixes: ["76","77","95","96","97"], length: 9 },
  { name: "🇿🇼 Zimbabwe", dial: "+263", prefixes: ["71","73","77","78"], length: 9 },
  { name: "🇲🇿 Mozambique", dial: "+258", prefixes: ["82","84","85","86","87"], length: 9 },
  { name: "🇺🇬 Uganda", dial: "+256", prefixes: ["70","71","72","74","75","76","77","78","79"], length: 9 },
  { name: "🇷🇼 Rwanda", dial: "+250", prefixes: ["72","73","78"], length: 9 },
  { name: "🇳🇿 New Zealand", dial: "+64", prefixes: ["20","21","22","27","28","29"], length: 9 },
  { name: "🇵🇰 Pakistan (PTCL)", dial: "+92", prefixes: ["021","041","051","061","071","081","091"], length: 11 },
];

interface Country { name: string; dial: string; prefixes: string[]; length: number; mobile?: boolean; }

function randDigit() { return Math.floor(Math.random() * 10); }
function randDigits(n: number) { let s = ''; for(let i=0;i<n;i++) s += randDigit(); return s; }
function randFrom(arr: string[]): string { return arr[Math.floor(Math.random() * arr.length)]; }

export function generateNumber(country: Country, useDial: boolean, useSpaces: boolean, localOnly: boolean) {
  const prefix: string = randFrom(country.prefixes);
  const totalLocal = country.length;
  const remaining = totalLocal - prefix.length;
  const local = prefix + randDigits(remaining);

  let formatted;
  if (localOnly) {
    formatted = useSpaces ? chunkNumber(local, 3) : local;
  } else {
    const withDial = useDial ? country.dial : '0';
    formatted = useSpaces
      ? withDial + ' ' + chunkNumber(local, 3)
      : withDial + local;
  }
  return { raw: (useDial && !localOnly ? country.dial : '') + local, display: formatted };
}

function chunkNumber(str: string, size: number) {
  const chunks = [];
  let i = 0;
  while (i < str.length) {
    chunks.push(str.slice(i, i + size));
    i += size;
  }
  return chunks.join(' ');
}
