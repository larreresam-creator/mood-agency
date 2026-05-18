exports.handler = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Backend Mood Agency OK ✓" })
  };
};
EOFcat > netlify.toml << 'EOF'
[build]
  functions = "netlify/functions"
  publish = "."
