FROM node:22-alpine
RUN apk add --no-cache nftables iproute2 curl util-linux
WORKDIR /lab
COPY . /lab/
ENTRYPOINT ["sh","/lab/run.sh"]
