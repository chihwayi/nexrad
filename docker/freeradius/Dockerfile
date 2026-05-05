FROM freeradius/freeradius-server:3.0

COPY sql /etc/freeradius/3.0/mods-available/sql
COPY clients.conf /etc/freeradius/3.0/clients.conf
COPY default /etc/freeradius/3.0/sites-available/default
COPY inner-tunnel /etc/freeradius/3.0/sites-available/inner-tunnel
COPY entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh \
    && ln -sf /etc/freeradius/3.0/mods-available/sql \
              /etc/freeradius/3.0/mods-enabled/sql \
    && rm -f /etc/freeradius/3.0/mods-enabled/eap

ENTRYPOINT ["/entrypoint.sh"]
CMD ["freeradius", "-f"]
