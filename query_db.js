import pkg from 'pg';
const { Client } = pkg;
const client = new Client({ connectionString: 'postgresql://corrida_user:corrida_password_dev@localhost:5432/corrida_db' });
client.connect()
  .then(() => client.query('SELECT id, email, \"isActive\", type, \"lastLoginAt\", \"createdAt\" FROM \"User\" WHERE email = \'crgasparoto@gmail.com\''))
  .then(res => {
    console.log(JSON.stringify(res.rows, null, 2));
    client.end();
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });