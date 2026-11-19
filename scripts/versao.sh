#!/bin/sh
# Sobe a versão dos ficheiros do site (cache do browser / GitHub Pages).
# Uso: scripts/versao.sh 17
# Atualiza o ?v= do main.js e do style.css no index.html e o de TODOS os imports
# entre módulos (./core.js?v=N, ...). Todos têm de usar o mesmo N: um módulo
# importado com dois ?v= diferentes seria carregado duas vezes.
set -e
v="$1"
[ -n "$v" ] || { echo "uso: $0 <versão>"; exit 1; }
cd "$(dirname "$0")/../web"
sed -i -E "s/(main\.js|style\.css)\?v=[0-9]+/\1?v=$v/g" index.html
for f in *.js; do
  sed -i -E "s#(from '\./[a-z]+\.js)(\?v=[0-9]+)?'#\1?v=$v'#g; s#(import\('\./[a-z]+\.js)(\?v=[0-9]+)?'\)#\1?v=$v')#g" "$f"
done
grep -n "?v=" index.html
grep -n "from './\|import('./" *.js | sed 's/{.*}/{…}/'
