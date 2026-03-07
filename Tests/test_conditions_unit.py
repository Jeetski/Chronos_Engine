
import unittest
import os
import sys
import shlex

# Ensure Modules can be imported
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from modules.conditions import evaluate_cond_tokens

# Improved wrapper using shlex to handle quoted strings properly
def evaluate_condition(text):
    # Use shlex to split preserving quotes (e.g. 'hello world' -> ['hello world'])
    tokens = shlex.split(text)
    return evaluate_cond_tokens(tokens)

class TestConditionsUnit(unittest.TestCase):
    
    def test_simple_equality(self):
        self.assertTrue(evaluate_condition("1 == 1"), "1 == 1 should be True")
        self.assertFalse(evaluate_condition("1 == 2"), "1 == 2 should be False")
        self.assertTrue(evaluate_condition("'apple' == 'apple'"), "String equality failed")

    def test_simple_inequality(self):
        self.assertTrue(evaluate_condition("1 != 2"), "1 != 2 should be True")
        self.assertFalse(evaluate_condition("1 != 1"), "1 != 1 should be False")

    def test_numeric_comparison(self):
        self.assertTrue(evaluate_condition("5 > 3"), "5 > 3 failed")
        self.assertTrue(evaluate_condition("3 < 5"), "3 < 5 failed")
        self.assertFalse(evaluate_condition("5 < 3"), "5 < 3 should be False")

    def test_logic_operators(self):
        # Tokens must be strings "True"/"False" which evaluate_cond_tokens doesn't natively cast to bools?
        # Wait, evaluate_cond_tokens grammar (line 225) calls 'compare'.
        # 'compare' uses coerce_numeric.
        # It does NOT handle boolean literals "True"/"False" directly as boolean values unless they are numeric (1/0).
        # Let's check coerce_numeric in modules/conditions.py.
        # It returns float or None.
        # So "True" == "True" is string comparison.
        # "True and True" -> parse_term -> parse_factor -> compare("True", "and", "True")?? NO.
        # "True and True":
        # parse_term calls parse_factor("True") -> returns ... wait.
        # parse_factor handles:
        # 1. '('
        # 2. 'not'
        # 3. 'exists'
        # 4. lhs op rhs
        # It DOES NOT handle bare booleans!
        # "True and True" is invalid grammar for this parser unless "True" is lhs, "and" is op, "True" is rhs? No, "and" is a logical connector (line 229).
        # So parse_factor expects "lhs op rhs". 
        # "True and True" fails because "True" is token[i], "and" is token[i+1].
        # parse_factor sees "and" is not a valid op for comparison? 
        # No, parse_factor grabs 3 tokens: lhs, op, rhs.
        # If I pass "True and True", it grabs "True", "and", "True". 
        # compare("True", "and", "True") returns False because "and" is not in mapping.
        # So "True and True" logic test was flawed based on the parser grammar.
        # I should test logic operators with Valid Comparisons.
        self.assertTrue(evaluate_condition("1 == 1 and 2 == 2"), "1==1 and 2==2 failed")
        self.assertFalse(evaluate_condition("1 == 1 and 1 == 2"), "1==1 and 1==2 should be False")
        self.assertTrue(evaluate_condition("1 == 1 or 1 == 2"), "1==1 or 1==2 failed")
        
    def test_grouping(self):
        # (1==2 or 1==1) is parsed as:
        # '(' -> recurse parse_expr -> sees 1==2 (False) OR 1==1 (True) -> Returns True
        self.assertTrue(evaluate_condition("(1 == 2 or 1 == 1) and 1 == 1"), "Grouping logic failed")


    def test_regex_match(self):
        # matches keyword
        self.assertTrue(evaluate_condition("'hello world' matches 'hello.*'"), "Regex match failed")
        self.assertFalse(evaluate_condition("'hello world' matches '^bye'"), "Regex mismatch should be False")

    def test_exists_file_mock(self):
        self.assertFalse(evaluate_condition("exists file:non_existent_ghost_file.txt"), "Non-existent file checking failed")

if __name__ == '__main__':
    unittest.main()
