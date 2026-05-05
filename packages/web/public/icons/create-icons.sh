#!/bin/bash
# Requires ImageMagick: brew install imagemagick
convert -size 192x192 xc:#6366f1 -fill white -font Helvetica-Bold \
  -pointsize 72 -gravity center -annotate 0 'NX' icon-192.png
convert -size 512x512 xc:#6366f1 -fill white -font Helvetica-Bold \
  -pointsize 180 -gravity center -annotate 0 'NX' icon-512.png
echo "Icons created."
