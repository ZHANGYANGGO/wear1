export const cities = [
  ['上海',31.2304,121.4737,'Asia/Shanghai'], ['北京',39.9042,116.4074,'Asia/Shanghai'],
  ['广州',23.1291,113.2644,'Asia/Shanghai'], ['成都',30.5728,104.0668,'Asia/Shanghai'],
  ['杭州',30.2741,120.1551,'Asia/Shanghai'], ['台北',25.033,121.5654,'Asia/Taipei'],
  ['东京',35.6762,139.6503,'Asia/Tokyo'], ['巴黎',48.8566,2.3522,'Europe/Paris'],
  ['纽约',40.7128,-74.006,'America/New_York'],
].map(([name,latitude,longitude,timezone]) => ({ name,latitude,longitude,timezone }));

export const scenarios = {
  mild: ['温和',18,18,13,21,2,10,9],
  cold: ['寒冷',8,5,4,10,3,15,18],
  hot: ['炎热',28,30,24,32,0,5,7],
  rain: ['下雨',18,16,15,19,63,90,16],
};

const conditions = new Map([
  [[0],'晴'], [[1],'大致晴朗'], [[2],'局部多云'], [[3],'阴'], [[45,48],'有雾'],
  [[51,53,55],'毛毛雨'], [[56,57,66,67],'冻雨'], [[61,63,65],'雨'],
  [[71,73,75,77,85,86],'降雪'], [[80,81,82],'阵雨'], [[95,96,99],'雷暴'],
].flatMap(([codes,label]) => codes.map(code => [code,label])));

function localTime(city, now) {
  return new Intl.DateTimeFormat('sv-SE', {timeZone:city.timezone,year:'numeric',month:'2-digit',
    day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now).replace(' ','T');
}

export function simulated(city, id, now = new Date()) {
  const [,temp,feels,low,high,code,rain,wind] = scenarios[id];
  return {city,source:'模拟天气',time:localTime(city,now),temp,feels,low,high,code,rain,wind,label:conditions.get(code)};
}

export function parseForecast(city, data, now = new Date()) {
  const current = data?.current;
  const daily = data?.daily;
  const date = localTime(city,now).slice(0,10);
  const day = daily?.time?.indexOf(date);
  if (!current?.time?.startsWith(date+'T') || data.timezone !== city.timezone || !(day >= 0)) {
    throw new Error('未取得该城市当地今天的天气。');
  }
  const weather = {city,source:'Open-Meteo',time:current.time,temp:current.temperature_2m,
    feels:current.apparent_temperature ?? null,code:current.weather_code,wind:current.wind_speed_10m,
    low:daily.temperature_2m_min?.[day],high:daily.temperature_2m_max?.[day],
    rain:daily.precipitation_probability_max?.[day]};
  if (![weather.temp,weather.wind,weather.code,weather.low,weather.high,weather.rain].every(Number.isFinite)
    || (weather.feels !== null && !Number.isFinite(weather.feels)) || weather.low>weather.high
    || weather.wind<0 || weather.rain<0 || weather.rain>100) throw new Error('天气数据不完整，请重试。');
  return {...weather,label:conditions.get(weather.code) ?? '天气类型未知'};
}

export async function forecast(city, signal) {
  const params = new URLSearchParams({latitude:city.latitude,longitude:city.longitude,timezone:city.timezone,
    forecast_days:'1',current:'temperature_2m,apparent_temperature,weather_code,wind_speed_10m',
    daily:'temperature_2m_max,temperature_2m_min,precipitation_probability_max',wind_speed_unit:'kmh'});
  const response = await fetch('https://api.open-meteo.com/v1/forecast?'+params,{signal,cache:'no-store'});
  if (!response.ok) throw new Error('天气服务暂不可用（HTTP '+response.status+'）。');
  return parseForecast(city,await response.json());
}
