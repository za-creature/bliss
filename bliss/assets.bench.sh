#!/usr/bin/env sh
source ~/.nvm/nvm.sh
for SIZE in 24 192 512 896
do
    for VERSION in 8 10 12 14
    do
        nvm run --silent $VERSION assets.bench.js $SIZE 100
    done
done
