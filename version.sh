#!/bin/sh
# Cambia la versión de los archivos para que los móviles descarguen siempre la última.
V=$(date +%Y%m%d%H%M)
sed -i -E "s#(css/styles\.css|js/app\.js)\?v=[^\"]*#\1?v=$V#g" index.html
sed -i -E "s#\.js\?v=[^']*'#.js?v=$V'#g" js/app.js js/store.js
echo "Versión $V"
