require('dotenv').config();
const express = require('express')
const cors = require('cors')
const mysql = require('mysql')
const { check, validationResult } = require('express-validator');

const app = express();
app.use(cors());
app.use(express.json());


const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB
});
db.connect((err) => {
  if (err) {
    console.log('Error connecting to the database:', err);
  } else {
    console.log('Connected to the MySQL database');
  }
});


app.get('/', (req, res) => {
  const sql = `
      SELECT q.quotation_id, q.name, q.email, q.gender, q.designation, q.domain, q.description, 
             q.price, q.quantity, q.date, q.entitle, q.total, q.discount, q.grandTotal, q.inputCount,
             p.label, p.dueWhen, p.installmentAmount
      FROM quotation q
      INNER JOIN payments p ON q.quotation_id = p.quotation_id
  `;



  db.query(sql, (err, result) => {
      if (err) return res.json({ Message: "Error inside server" });
      const data = {}
      result.forEach(row => {
          // If the quotation_id is not already in the data object, create it
          if (!data[row.quotation_id]) {
              data[row.quotation_id] = {
                  id: row.quotation_id,
                  name: row.name,
                  email: row.email,
                  gender: row.gender,
                  date: row.date,
                  designation: row.designation,
                  domain: row.domain,
                  entitle: row.entitle,
                  description: row.description,
                  totalInstallment: 0,
                  price: row.price,
                  quantity: row.quantity,
                  total: row.total,
                  discount: row.discount,
                  grandTotal: row.grandTotal,
                  inputCount: row.inputCount,
                  installments: []
              };
          }

          // Add the installment data to the installments array
          if (row.label) {
              data[row.quotation_id].installments.push({
                  label: row.label,
                  dueWhen: row.dueWhen,
                  installmentAmount: row.installmentAmount
              });
              data[row.quotation_id].totalInstallment++;
          }
      });

      // Convert the object into an array if necessary
      const response = Object.values(data);
      return res.json(response);
  });
});


// ************* Post Data ************
app.post('/create', (req, res) => {
  const quotation_sql = "INSERT INTO quotation (`name`, `email`, `gender`, `date`, `designation`, `domain`, `entitle`, `description`, `price`, `quantity`, `total`, `discount`, `grandTotal`, `inputCount`) VALUES (?)";
  const quotation_values = [
      req.body.name,
      req.body.email,
      req.body.gender,
      req.body.date,
      req.body.designation,
      req.body.domain,
      req.body.entitle,
      req.body.description,
      req.body.price,
      req.body.quantity,
      req.body.total,
      req.body.discount,
      req.body.grandTotal,
      req.body.inputCount
  ];

  db.query(quotation_sql, [quotation_values], (err, result) => {
      if (err) return res.json(err);

      const quotationId = result.insertId;
      const installments = req.body.installments.map(installment => [
          quotationId,
          installment.label,
          installment.dueWhen,
          installment.installmentAmount
      ]);

      const installmentsSql = `INSERT INTO payments 
      (\`quotation_id\`, \`label\`, \`dueWhen\`, \`installmentAmount\`) 
      VALUES ?`;

      db.query(installmentsSql, [installments], (err, result) => {
          if (err) return res.json(err);

          return res.json(result);
      });
  });
});

// ********************* Edit Data ****************
app.put('/edit/:id', (req, res) => {
  const quotationId = req.params.id;

  const {
      name, email, gender, date, designation, domain, entitle,
      description, price, quantity, total, discount, grandTotal, inputCount, installments
  } = req.body;  // Simplified to just update the name

  console.log('Received data for update:', req.body);

  const updateQuotationSql = `
    UPDATE quotation 
    SET name = ?, email = ?, gender = ?, date = ?, designation = ?, domain = ?, entitle = ?, description = ?,
    price = ?, quantity = ?, total = ?, discount = ?, grandTotal = ?, inputCount = ?
    WHERE quotation_id = ?
  `;

  const quotationValues = [
      name, email, gender, date, designation, domain, entitle,
      description, price, quantity, total, discount, grandTotal, inputCount, quotationId
  ];


  db.query(updateQuotationSql, quotationValues, (err, result) => {
      if (err) {
          console.error('Error updating quotation:', err);
          return res.status(500).json({ message: 'Error updating quotation', error: err });
      }

      if (result.affectedRows === 0) {
          return res.status(404).json({ message: 'Quotation not found' });
      }

      const deleteInstallmentsSql = `DELETE FROM payments WHERE quotation_id = ?`;
      db.query(deleteInstallmentsSql, [quotationId], (err, result) => {
          if (err) {
              console.error('Error deleting old installments:', err);
              return res.status(500).json({ message: 'Error deleting old installments', error: err });
          }
          const insertInstallmentsSql = `
          INSERT INTO payments (quotation_id, label, dueWhen, installmentAmount) 
          VALUES ?
      `;

          const installmentsData = installments.map(installment => [
              quotationId,
              installment.label,
              installment.dueWhen,  // Assuming `dueWhen` is correctly formatted
              installment.installmentAmount
          ]);

          db.query(insertInstallmentsSql, [installmentsData], (err, result) => {
              if (err) {
                  console.error('Error inserting installments:', err);
                  return res.status(500).json({ message: 'Error inserting installments', error: err });
              }

              // Both the quotation and the installments were successfully updated/inserted
              return res.json({ message: 'Quotation and installments updated successfully' });
          });
      });
  });
});




// ************** Delete data ***************
app.delete('/delete/:id', (req, res) => {
  const quotationId = req.params.id;

  // SQL query to delete the quotation
  const deleteQuotationSql = `DELETE FROM quotation WHERE quotation_id = ?`;

  db.query(deleteQuotationSql, [quotationId], (err, result) => {
      if (err) {
          console.error('Error deleting quotation:', err);
          return res.status(500).json({ message: 'Error deleting quotation', error: err });
      }

      // Check if any rows were affected (i.e., if the delete was successful)
      if (result.affectedRows === 0) {
          return res.status(404).json({ message: 'Quotation not found' });
      }

      // Delete associated installments
      const deleteInstallmentsSql = `DELETE FROM payments WHERE quotation_id = ?`;
      db.query(deleteInstallmentsSql, [quotationId], (err, result) => {
          if (err) {
              console.error('Error deleting installments:', err);
              return res.status(500).json({ message: 'Error deleting installments', error: err });
          }

          return res.json({ message: "Quotation and installments deleted successfully" });
      });
  });
});


// ************* Get Data by Quotation ID *************
app.get('/pdf/:id', (req, res) => {
  const quotationId = req.params.id;
  const sql = `
      SELECT q.quotation_id, q.name, q.email, q.gender, q.designation, q.domain, q.description, 
             q.price, q.quantity, q.date, q.entitle, q.total, q.discount, q.grandTotal, q.inputCount,
             p.label, p.dueWhen, p.installmentAmount
      FROM quotation q
      LEFT JOIN payments p ON q.quotation_id = p.quotation_id
      WHERE q.quotation_id = ?
  `;

  db.query(sql, [quotationId], (err, result) => {
      if (err) return res.json({ Message: "Error retrieving data" });

      if (result.length === 0) {
          return res.json({ Message: "Quotation not found" });
      }

      const data = {
          id: result[0].quotation_id,
          name: result[0].name,
          email: result[0].email,
          gender: result[0].gender,
          date: result[0].date,
          designation: result[0].designation,
          domain: result[0].domain,
          entitle: result[0].entitle,
          description: result[0].description,
          totalInstallment: 0,
          price: result[0].price,
          quantity: result[0].quantity,
          total: result[0].total,
          discount: result[0].discount,
          grandTotal: result[0].grandTotal,
          inputCount: result[0].inputCount,
          installments: []
      };

      result.forEach(row => {
          if (row.label) {
              data.installments.push({
                  label: row.label,
                  dueWhen: row.dueWhen,
                  installmentAmount: row.installmentAmount
              });
              data.totalInstallment++;
          }
      });

      return res.json(data);
  });
});


// ************************ Register form ************************
app.post('/register', [
  check('email').isEmail().withMessage('Invalid email format'),
], (req, res) => {

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
  }

  const { name, email, password, gender, role } = req.body;
  const checkEmailQuery = 'SELECT * FROM employees WHERE email = ?';

  // Hash the password
  db.query(checkEmailQuery, [email], (err, result) => {
      if (err) {
          console.error('Error checking email:', err);
          return res.status(500).json({ message: 'Error checking email', error: err });
      }

      if (result.length > 0) {
          // Email already exists
          return res.status(409).json({ message: 'Email already in use' });
      }

      bcrypt.hash(password, saltRounds, (err, hash) => {
          if (err) {
              return res.status(500).json({ message: 'Error hashing password', error: err });
          }

          const query = 'INSERT INTO employees (name, email, password, gender, role) VALUES (?, ?, ?, ?, ?)';
          db.query(query, [name, email, hash, gender, role], (err, result) => {
              if (err) {
                  console.error('Error registering user:', err);
                  return res.status(500).json({ message: 'Error registering user', error: err });
              }
              res.status(201).json({ message: 'User registered successfully' });
          });
      });



  })

});



// ************* Check email exists or not ******************
app.post('/check-email', (req, res) => {
  const { email } = req.body;

  const checkEmailQuery = 'SELECT COUNT(*) as count FROM employees WHERE email = ?';
  db.query(checkEmailQuery, [email], (err, results) => {
      if (err) {
          console.error('Error checking email:', err);
          return res.status(500).json({ error: 'Internal server error' });
      }
      
      const emailExists = results[0].count > 0;
      res.json({ exists: emailExists });
  });
});
  // ****************** Login Form **************
  app.post('/login', (req, res) => {
      const { email, password } = req.body;
    
      const query = 'SELECT * FROM employees WHERE email = ?';
      db.query(query, [email], (err, results) => {
        if (err) {
          console.error('Error finding user:', err);
          return res.status(500).json({ message: 'Error finding user', error: err });
        }
    
        if (results.length === 0) {
          return res.status(401).json({ message: 'Invalid email or password' });
        }
    
        const user = results[0];
        bcrypt.compare(password, user.password, (err, isMatch) => {
          if (err) {
            console.error('Error comparing passwords:', err);
            return res.status(500).json({ message: 'Error comparing passwords', error: err });
          }
    
          if (!isMatch) {
            return res.status(401).json({ message: 'Invalid email or password' });
          }
    
          // Generate JWT
          const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, secretKey, { expiresIn: '1h' });
          res.json({ message: 'Login successful', token });
        });
      });
    });




app.listen(process.env.PORT || 4000, () => {
  console.log(`app is listening`)
})