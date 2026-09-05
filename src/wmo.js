// WMO 4677 weather codes, in the words a person would use.
(() => {
  const S = (window.__SkyCal = window.__SkyCal || {});
  const T = {
    0:'Clear', 1:'Mainly clear', 2:'Partly cloudy', 3:'Overcast',
    45:'Fog', 48:'Freezing fog',
    51:'Light drizzle', 53:'Drizzle', 55:'Heavy drizzle',
    56:'Freezing drizzle', 57:'Freezing drizzle',
    61:'Light rain', 63:'Rain', 65:'Heavy rain',
    66:'Freezing rain', 67:'Freezing rain',
    71:'Light snow', 73:'Snow', 75:'Heavy snow', 77:'Snow grains',
    80:'Light showers', 81:'Showers', 82:'Violent showers',
    85:'Snow showers', 86:'Heavy snow showers',
    95:'Thunderstorm', 96:'Thunderstorm with hail', 99:'Thunderstorm with hail'
  };
  S.conditionText = code => T[code] || (code >= 95 ? 'Thunderstorm' : 'Unknown');
})();
