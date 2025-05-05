## YAML+LLM Keywords & Implementations

#### Correct & Replace
Highlight text to send to the LLM to respond & replace broken and/or incorrect code. Future implementations will involve a larger scope of code-context

Examples: 
```
# Correcting broken JavaScript
correct: true
data: |
  fucntion add(a, b) {
    reutrn a + b;
  }
```
```
# Correcting YAML text/syntax
correct: true
data: |
  customer
    firstName: "Jane"
    lastName Smith
    contact-info
      email jane.smith@example.com
      phone-numbers
        - type: home
        - 555-1234
        - type; mobile
          number: 555-5678
    orders:
      - id: A001
```
