#!/bin/bash

# docker compose exec mongodb mongo "rs.initiate()"
# docker compose exec mongodb mongo "rs.add('mongodbslave')"

docker compose exec mongodb mongo --eval "rs.initiate()"
docker compose exec mongodb mongo --eval "rs.add('mongodbslave:27017')"