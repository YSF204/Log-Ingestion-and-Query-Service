-TECH STACK :
NodeJs, Typescript, Express , Postgressql , Docker 

-ARCHITECTURE :
LAYRED ARCH 
CLINET -> APPLICATION LAYER -> DATA LAYER 

-ROUTES :
POST : /logs 
GET : /logs -> optional filters 
GET : logs/aggregate  -> time bucketed aggregation
GET : /health 

-TECHNICAL DECISIONS 



- 
INGEST LOGS :

curl -X POST http://localhost:8080/logs \
  -H "Content-Type: application/json" \
  -d '{"logs":[
    {
      "timestamp":"2026-08-10T10:00:00Z",
      "level":"error",
      "service":"checkout",
      "message":"payment declined",
      "attributes":{"region":"eu-west","user_id":"42"}
    },
    {
      "timestamp":"2026-08-10T10:00:00Z",
      "level":"critical",
      "service":"checkout",
      "message":"invalid level"
    }
  ]}'

  QUERY : 
curl "http://localhost:8080/logs?q=declined&since=2026-08-10T09:00:00Z"

AGGREGATION : 
curl "http://localhost:8080/logs/aggregate?since=2026-08-10T09:00:00Z&until=2026-08-10T11:00:00Z&bucket=1h&group_by=service"