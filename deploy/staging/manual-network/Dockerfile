ARG BASE_IMAGE=aegis-supervised-staging:soak-da7db65-20261029
FROM ${BASE_IMAGE}
USER root
RUN apk add --no-cache nftables util-linux
COPY deploy/staging/manual-network/ ./deploy/staging/manual-network/
ENTRYPOINT ["sh","/app/deploy/staging/manual-network/run.sh"]
