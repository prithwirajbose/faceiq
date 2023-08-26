FROM didstopia/base:nodejs-16-ubuntu-20.04

ENV NODE_TLS_REJECT_UNAUTHORIZED=0

RUN npm config set strict-ssl false

RUN export HTTP_PROXY=http://"a07752a:Jun@2023"@mckcache.mck.experian.com:9090
RUN export HTTPS_PROXY=http://"a07752a:Jun@2023"@mckcache.mck.experian.com:9090

#RUN sudo apt-get install wget build-essential chrpath libssl-dev libxft-dev -y
#RUN apt-get install libfreetype6 libfreetype6-dev -y
#RUN apt-get install libfontconfig1 libfontconfig1-dev -y

WORKDIR /app

COPY package.json ./

COPY . .

#RUN chmod -R 777 /app

EXPOSE 8080

EXPOSE 9090

CMD [ "node", "index.js" ]