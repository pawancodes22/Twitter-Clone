const express = require('express')
const path = require('path')
const bcrypt = require('bcrypt')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const jwt = require('jsonwebtoken')

const app = express()
app.use(express.json())
const dbPath = path.join(__dirname, 'twitterClone.db')
let db

const startDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server is up and running !!!')
    })
  } catch (e) {
    console.log(`Database Error: ${e}`)
  }
}

startDbAndServer()

verifier = (request, response, next) => {
  const authHeader = request.headers.authorization
  let jwtToken
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'SECRET_TOKEN', (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.payload = payload
        next()
      }
    })
  }
}

app.post('/register', async (request, response) => {
  const body = request.body
  const checkUserExists = `
        SELECT *
        FROM user
        WHERE 
            username == '${body.username}';
    `
  const dbUser = await db.get(checkUserExists)
  if (dbUser) {
    response.status(400)
    response.send('User already exists')
  } else {
    if (body.password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashedPassword = await bcrypt.hash(body.password, 15)
      const postQuery = `
        INSERT INTO 
          user (username, password, name, gender)
        VALUES 
          (
            '${body.username}',
            '${hashedPassword}',
            '${body.name}',
            '${body.gender}'
          )
      `
      await db.run(postQuery)
      response.send('User created successfully')
    }
  }
})

app.post('/login', async (request, response) => {
  const {username, password} = request.body
  const checkUserExists = `
        SELECT *
        FROM user
        WHERE 
            username == '${username}';
    `
  const dbUser = await db.get(checkUserExists)
  if (dbUser) {
    if (await bcrypt.compare(password, dbUser.password)) {
      //successful login
      const payload = {
        username: dbUser.username,
        user_id: dbUser.user_id,
      }
      const jwtToken = jwt.sign(payload, 'SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  } else {
    response.status(400)
    response.send('Invalid user')
  }
})

app.get('/user/tweets/feed', verifier, async (request, response) => {
  const user_id = request.payload.user_id
  const getQuery = `
    SELECT username, tweet, date_time AS dateTime
    FROM ((follower INNER JOIN tweet ON following_user_id = tweet.user_id) INNER JOIN user 
      ON following_user_id	= user.user_id)
    WHERE
      follower_user_id = ${user_id}
    LIMIT 5;
  `
  const result = await db.all(getQuery)
  response.send(result)
})

app.get('/user/following', verifier, async (request, response) => {
  const user_id = request.payload.user_id
  const getQuery = `
    SELECT name
    FROM user INNER JOIN follower ON following_user_id = user.user_id
    WHERE
      follower_user_id = ${user_id};
  `
  const result = await db.all(getQuery)
  response.send(result)
})

app.get('/user/followers', verifier, async (request, response) => {
  const user_id = request.payload.user_id
  const getQuery = `
    SELECT name
    FROM user INNER JOIN follower ON follower_user_id = user.user_id
    WHERE
      following_user_id = ${user_id};
  `
  const result = await db.all(getQuery)
  response.send(result)
})

app.get('/tweets/:tweetId', verifier, async (request, response) => {
  const {tweetId} = request.params
  const user_id = request.payload.user_id
  const getQuery = `
    SELECT tweet, COUNT(DISTINCT like_id) AS likes, COUNT(DISTINCT reply_id) AS replies, date_time AS dateTime
    FROM ((((follower INNER JOIN tweet ON following_user_id = tweet.user_id) INNER JOIN user 
      ON following_user_id	= user.user_id) INNER JOIN like ON tweet.tweet_id = like.tweet_id)
      INNER JOIN reply ON tweet.tweet_id = reply.tweet_id)
    WHERE
      follower_user_id = ${user_id} AND tweet.tweet_id = ${tweetId}
  `
  const result = await db.get(getQuery)
  if (result.tweet === null) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    response.send(result)
  }
})

app.get('/tweets/:tweetId/likes', verifier, async (request, response) => {
  const {tweetId} = request.params
  const userId = request.payload.user_id
  const getQuery = `
    SELECT username
    FROM (((follower INNER JOIN tweet ON following_user_id = tweet.user_id)
    INNER JOIN like ON tweet.tweet_id = like.tweet_id) INNER JOIN user ON 
    like.user_id = user.user_id)
    WHERE
    tweet.tweet_id = ${tweetId} AND follower_user_id = ${userId};
  `
  const result = await db.all(getQuery)
  if (result.length === 0) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    const likes = result.map(i => i.username)
    response.send({likes})
  }
})

app.get('/tweets/:tweetId/replies', verifier, async (request, response) => {
  const {tweetId} = request.params
  const userId = request.payload.user_id
  const getQuery = `
    SELECT name, reply
    FROM (((follower INNER JOIN tweet ON following_user_id = tweet.user_id)
    INNER JOIN reply ON tweet.tweet_id = reply.tweet_id) INNER JOIN user ON 
    reply.user_id = user.user_id)
    WHERE
    tweet.tweet_id = ${tweetId} AND follower_user_id = ${userId};
  `
  const result = await db.all(getQuery)
  console.log(result)
  if (result.length === 0) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    const replies = result.map(i => i)
    response.send({replies})
  }
})

app.get('/user/tweets', verifier, async (request, response) => {
  const userId = request.payload.user_id
  const getQuery = `
    SELECT tweet, COUNT(DISTINCT like_id) AS likes, COUNT(DISTINCT reply_id) AS replies, date_time AS dateTime
    FROM ((tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id) 
    INNER JOIN reply ON tweet.tweet_id = reply.tweet_id)
    WHERE
      tweet.user_id = ${userId}
    GROUP BY 
      tweet.tweet
  `
  const result = await db.all(getQuery)
  if (result.length === 0) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    response.send(result)
  }
})

app.post('/user/tweets', verifier, async (request, response) => {
  const body = request.body
  const userId = request.payload.user_id
  const postQuery = `
    INSERT INTO 
      tweet(tweet, user_id, date_time)
    VALUES 
      (
        '${body.tweet}',
        ${userId},
        CURRENT_TIMESTAMP
      )
  `
  const output = await db.run(postQuery)
  console.log(output)
  console.log(postQuery)
  response.send('Created a Tweet')
})

app.delete('/tweets/:tweetId', verifier, async (request, response) => {
  const {tweetId} = request.params
  const userId = request.payload.user_id
  const checkPost = `
    SELECT user_id
    FROM tweet 
    WHERE 
      tweet.tweet_id = ${tweetId}
  `
  const tweeterId = await db.get(checkPost)
  if (tweeterId.user_id === userId) {
    const deleteQuery = `
      DELETE FROM 
        tweet 
      WHERE 
        tweet_id = ${tweetId}
    `
    await db.run(deleteQuery)
    response.send('Tweet Removed')
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

module.exports = app
