#!/bin/sh

set -e
REPO_URI="echo.research.clinic"

docker pull ${REPO_URI}/web
docker pull ${REPO_URI}/home
docker pull ${REPO_URI}/janus
docker pull ${REPO_URI}/nginx
docker pull ${REPO_URI}/mongodb
docker pull ${REPO_URI}/jic-janus-controller
