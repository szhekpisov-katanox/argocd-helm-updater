/**
 * Unit tests for VersionParser
 */

import { VersionParser } from '../../../src/utils/version-parser';

describe('VersionParser', () => {
  describe('parse', () => {
    describe('exact versions', () => {
      it('should parse a simple exact version', () => {
        const result = VersionParser.parse('1.2.3');
        
        expect(result.original).toBe('1.2.3');
        expect(result.type).toBe('exact');
        expect(result.isValid).toBe(true);
        expect(result.range).not.toBeNull();
        expect(result.error).toBeUndefined();
      });

      it('should parse version with pre-release tag', () => {
        const result = VersionParser.parse('1.2.3-alpha.1');
        
        expect(result.isValid).toBe(true);
        expect(result.type).toBe('exact');
      });

      it('should parse version with build metadata', () => {
        const result = VersionParser.parse('1.2.3+build.123');
        
        expect(result.isValid).toBe(true);
        expect(result.type).toBe('exact');
      });

      it('should parse version with both pre-release and build metadata', () => {
        const result = VersionParser.parse('1.2.3-beta.2+build.456');
        
        expect(result.isValid).toBe(true);
        expect(result.type).toBe('exact');
      });
    });

    describe('caret ranges', () => {
      it('should parse caret range', () => {
        const result = VersionParser.parse('^1.2.0');
        
        expect(result.original).toBe('^1.2.0');
        expect(result.type).toBe('range');
        expect(result.isValid).toBe(true);
        expect(result.range).not.toBeNull();
      });

      it('should parse caret range with patch version', () => {
        const result = VersionParser.parse('^1.2.3');
        
        expect(result.isValid).toBe(true);
        expect(result.type).toBe('range');
      });

      it('should parse caret range with major version only', () => {
        const result = VersionParser.parse('^1.0.0');
        
        expect(result.isValid).toBe(true);
        expect(result.type).toBe('range');
      });
    });

    describe('tilde ranges', () => {
      it('should parse tilde range', () => {
        const result = VersionParser.parse('~1.2.0');
        
        expect(result.original).toBe('~1.2.0');
        expect(result.type).toBe('range');
        expect(result.isValid).toBe(true);
        expect(result.range).not.toBeNull();
      });

      it('should parse tilde range with patch version', () => {
        const result = VersionParser.parse('~1.2.3');
        
        expect(result.isValid).toBe(true);
        expect(result.type).toBe('range');
      });
    });

    describe('comparison operators', () => {
      it('should parse greater than or equal', () => {
        const result = VersionParser.parse('>=1.0.0');
        
        expect(result.isValid).toBe(true);
        expect(result.type).toBe('range');
      });

      it('should parse greater than', () => {
        const result = VersionParser.parse('>1.0.0');
        
        expect(result.isValid).toBe(true);
        expect(result.type).toBe('range');
      });

      it('should parse less than or equal', () => {
        const result = VersionParser.parse('<=2.0.0');
        
        expect(result.isValid).toBe(true);
        expect(result.type).toBe('range');
      });

      it('should parse less than', () => {
        const result = VersionParser.parse('<2.0.0');
        
        expect(result.isValid).toBe(true);
        expect(result.type).toBe('range');
      });

      it('should parse equals', () => {
        const result = VersionParser.parse('=1.0.0');
        
        expect(result.isValid).toBe(true);
        expect(result.type).toBe('range');
      });
    });

    describe('hyphen ranges', () => {
      it('should parse hyphen range', () => {
        const result = VersionParser.parse('1.0.0 - 2.0.0');
        
        expect(result.isValid).toBe(true);
        expect(result.type).toBe('range');
      });

      it('should parse hyphen range with partial versions', () => {
        const result = VersionParser.parse('1.2 - 2.3');
        
        expect(result.isValid).toBe(true);
        expect(result.type).toBe('range');
      });
    });

    describe('X-ranges', () => {
      it('should parse X-range with lowercase x', () => {
        const result = VersionParser.parse('1.2.x');
        
        expect(result.isValid).toBe(true);
        expect(result.type).toBe('range');
      });

      it('should parse X-range with uppercase X', () => {
        const result = VersionParser.parse('1.X');
        
        expect(result.isValid).toBe(true);
        expect(result.type).toBe('range');
      });

      it('should parse wildcard', () => {
        const result = VersionParser.parse('*');
        
        expect(result.isValid).toBe(true);
        expect(result.type).toBe('range');
      });
    });

    describe('combined ranges', () => {
      it('should parse combined range with AND', () => {
        const result = VersionParser.parse('>=1.0.0 <2.0.0');
        
        expect(result.isValid).toBe(true);
        expect(result.type).toBe('range');
      });

      it('should parse combined range with OR', () => {
        const result = VersionParser.parse('1.0.0 || 2.0.0');
        
        expect(result.isValid).toBe(true);
        expect(result.type).toBe('range');
      });

      it('should parse complex combined range', () => {
        const result = VersionParser.parse('>=1.0.0 <2.0.0 || >=3.0.0 <4.0.0');
        
        expect(result.isValid).toBe(true);
        expect(result.type).toBe('range');
      });
    });

    describe('invalid constraints', () => {
      it('should handle empty string', () => {
        const result = VersionParser.parse('');
        
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Empty constraint string');
      });

      it('should handle whitespace only', () => {
        const result = VersionParser.parse('   ');
        
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Empty constraint string');
      });

      it('should handle invalid version format', () => {
        const result = VersionParser.parse('not-a-version');
        
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should handle malformed range', () => {
        const result = VersionParser.parse('>>1.0.0');
        
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    describe('whitespace handling', () => {
      it('should trim leading whitespace', () => {
        const result = VersionParser.parse('  1.2.3');
        
        expect(result.isValid).toBe(true);
        expect(result.type).toBe('exact');
      });

      it('should trim trailing whitespace', () => {
        const result = VersionParser.parse('1.2.3  ');
        
        expect(result.isValid).toBe(true);
        expect(result.type).toBe('exact');
      });

      it('should preserve internal whitespace in ranges', () => {
        const result = VersionParser.parse('>=1.0.0 <2.0.0');
        
        expect(result.isValid).toBe(true);
        expect(result.type).toBe('range');
      });
    });
  });

  describe('satisfies', () => {
    it('should check if version satisfies exact constraint', () => {
      const constraint = VersionParser.parse('1.2.3');
      
      expect(VersionParser.satisfies('1.2.3', constraint)).toBe(true);
      expect(VersionParser.satisfies('1.2.4', constraint)).toBe(false);
      expect(VersionParser.satisfies('1.2.2', constraint)).toBe(false);
    });

    it('should check if version satisfies caret range', () => {
      const constraint = VersionParser.parse('^1.2.0');
      
      expect(VersionParser.satisfies('1.2.0', constraint)).toBe(true);
      expect(VersionParser.satisfies('1.2.5', constraint)).toBe(true);
      expect(VersionParser.satisfies('1.3.0', constraint)).toBe(true);
      expect(VersionParser.satisfies('2.0.0', constraint)).toBe(false);
      expect(VersionParser.satisfies('1.1.9', constraint)).toBe(false);
    });

    it('should check if version satisfies tilde range', () => {
      const constraint = VersionParser.parse('~1.2.0');
      
      expect(VersionParser.satisfies('1.2.0', constraint)).toBe(true);
      expect(VersionParser.satisfies('1.2.5', constraint)).toBe(true);
      expect(VersionParser.satisfies('1.3.0', constraint)).toBe(false);
      expect(VersionParser.satisfies('1.1.9', constraint)).toBe(false);
    });

    it('should check if version satisfies comparison operator', () => {
      const constraint = VersionParser.parse('>=1.0.0');
      
      expect(VersionParser.satisfies('1.0.0', constraint)).toBe(true);
      expect(VersionParser.satisfies('1.5.0', constraint)).toBe(true);
      expect(VersionParser.satisfies('2.0.0', constraint)).toBe(true);
      expect(VersionParser.satisfies('0.9.9', constraint)).toBe(false);
    });

    it('should return false for invalid constraint', () => {
      const constraint = VersionParser.parse('invalid');
      
      expect(VersionParser.satisfies('1.0.0', constraint)).toBe(false);
    });

    it('should return false for invalid version', () => {
      const constraint = VersionParser.parse('1.0.0');
      
      expect(VersionParser.satisfies('invalid', constraint)).toBe(false);
    });
  });

  describe('versionSatisfies', () => {
    it('should check version against constraint string', () => {
      expect(VersionParser.versionSatisfies('1.2.3', '1.2.3')).toBe(true);
      expect(VersionParser.versionSatisfies('1.2.3', '^1.2.0')).toBe(true);
      expect(VersionParser.versionSatisfies('1.2.3', '~1.2.0')).toBe(true);
      expect(VersionParser.versionSatisfies('1.2.3', '>=1.0.0')).toBe(true);
      expect(VersionParser.versionSatisfies('1.2.3', '<1.0.0')).toBe(false);
    });
  });

  describe('filterVersions', () => {
    const versions = ['1.0.0', '1.1.0', '1.2.0', '1.2.5', '1.3.0', '2.0.0', '2.1.0'];

    it('should filter versions by exact constraint', () => {
      const constraint = VersionParser.parse('1.2.0');
      const filtered = VersionParser.filterVersions(versions, constraint);
      
      expect(filtered).toEqual(['1.2.0']);
    });

    it('should filter versions by caret range', () => {
      const constraint = VersionParser.parse('^1.2.0');
      const filtered = VersionParser.filterVersions(versions, constraint);
      
      expect(filtered).toEqual(['1.2.0', '1.2.5', '1.3.0']);
    });

    it('should filter versions by tilde range', () => {
      const constraint = VersionParser.parse('~1.2.0');
      const filtered = VersionParser.filterVersions(versions, constraint);
      
      expect(filtered).toEqual(['1.2.0', '1.2.5']);
    });

    it('should filter versions by comparison operator', () => {
      const constraint = VersionParser.parse('>=1.2.0 <2.0.0');
      const filtered = VersionParser.filterVersions(versions, constraint);
      
      expect(filtered).toEqual(['1.2.0', '1.2.5', '1.3.0']);
    });

    it('should return empty array for invalid constraint', () => {
      const constraint = VersionParser.parse('invalid');
      const filtered = VersionParser.filterVersions(versions, constraint);
      
      expect(filtered).toEqual([]);
    });

    it('should handle empty version list', () => {
      const constraint = VersionParser.parse('1.0.0');
      const filtered = VersionParser.filterVersions([], constraint);
      
      expect(filtered).toEqual([]);
    });
  });

  describe('maxSatisfying', () => {
    const versions = ['1.0.0', '1.1.0', '1.2.0', '1.2.5', '1.3.0', '2.0.0', '2.1.0'];

    it('should find max satisfying version for caret range', () => {
      const constraint = VersionParser.parse('^1.2.0');
      const max = VersionParser.maxSatisfying(versions, constraint);
      
      expect(max).toBe('1.3.0');
    });

    it('should find max satisfying version for tilde range', () => {
      const constraint = VersionParser.parse('~1.2.0');
      const max = VersionParser.maxSatisfying(versions, constraint);
      
      expect(max).toBe('1.2.5');
    });

    it('should find max satisfying version for comparison operator', () => {
      const constraint = VersionParser.parse('<2.0.0');
      const max = VersionParser.maxSatisfying(versions, constraint);
      
      expect(max).toBe('1.3.0');
    });

    it('should return null for invalid constraint', () => {
      const constraint = VersionParser.parse('invalid');
      const max = VersionParser.maxSatisfying(versions, constraint);
      
      expect(max).toBeNull();
    });

    it('should return null when no versions satisfy', () => {
      const constraint = VersionParser.parse('>10.0.0');
      const max = VersionParser.maxSatisfying(versions, constraint);
      
      expect(max).toBeNull();
    });
  });

  describe('minSatisfying', () => {
    const versions = ['1.0.0', '1.1.0', '1.2.0', '1.2.5', '1.3.0', '2.0.0', '2.1.0'];

    it('should find min satisfying version for caret range', () => {
      const constraint = VersionParser.parse('^1.2.0');
      const min = VersionParser.minSatisfying(versions, constraint);
      
      expect(min).toBe('1.2.0');
    });

    it('should find min satisfying version for comparison operator', () => {
      const constraint = VersionParser.parse('>=1.2.0');
      const min = VersionParser.minSatisfying(versions, constraint);
      
      expect(min).toBe('1.2.0');
    });

    it('should return null for invalid constraint', () => {
      const constraint = VersionParser.parse('invalid');
      const min = VersionParser.minSatisfying(versions, constraint);
      
      expect(min).toBeNull();
    });
  });

  describe('isValidVersion', () => {
    it('should validate correct versions', () => {
      expect(VersionParser.isValidVersion('1.2.3')).toBe(true);
      expect(VersionParser.isValidVersion('0.0.0')).toBe(true);
      expect(VersionParser.isValidVersion('1.2.3-alpha.1')).toBe(true);
      expect(VersionParser.isValidVersion('1.2.3+build.123')).toBe(true);
    });

    it('should reject invalid versions', () => {
      expect(VersionParser.isValidVersion('not-a-version')).toBe(false);
      expect(VersionParser.isValidVersion('1.2')).toBe(false);
      expect(VersionParser.isValidVersion('1')).toBe(false);
      expect(VersionParser.isValidVersion('')).toBe(false);
    });
  });

  describe('isValidConstraint', () => {
    it('should validate correct constraints', () => {
      expect(VersionParser.isValidConstraint('1.2.3')).toBe(true);
      expect(VersionParser.isValidConstraint('^1.2.0')).toBe(true);
      expect(VersionParser.isValidConstraint('~1.2.0')).toBe(true);
      expect(VersionParser.isValidConstraint('>=1.0.0')).toBe(true);
      expect(VersionParser.isValidConstraint('1.0.0 - 2.0.0')).toBe(true);
      expect(VersionParser.isValidConstraint('*')).toBe(true);
    });

    it('should reject invalid constraints', () => {
      expect(VersionParser.isValidConstraint('not-a-constraint')).toBe(false);
      expect(VersionParser.isValidConstraint('')).toBe(false);
      expect(VersionParser.isValidConstraint('>>1.0.0')).toBe(false);
    });
  });

  describe('compare', () => {
    describe('basic version comparison', () => {
      it('should compare versions correctly', () => {
        expect(VersionParser.compare('1.0.0', '2.0.0')).toBe(-1);
        expect(VersionParser.compare('2.0.0', '1.0.0')).toBe(1);
        expect(VersionParser.compare('1.0.0', '1.0.0')).toBe(0);
      });

      it('should compare versions with different components', () => {
        expect(VersionParser.compare('1.2.3', '1.2.4')).toBe(-1);
        expect(VersionParser.compare('1.2.3', '1.3.0')).toBe(-1);
        expect(VersionParser.compare('1.2.3', '2.0.0')).toBe(-1);
      });

      it('should compare major version differences', () => {
        expect(VersionParser.compare('1.0.0', '2.0.0')).toBe(-1);
        expect(VersionParser.compare('10.0.0', '2.0.0')).toBe(1);
        expect(VersionParser.compare('1.9.9', '2.0.0')).toBe(-1);
      });

      it('should compare minor version differences', () => {
        expect(VersionParser.compare('1.1.0', '1.2.0')).toBe(-1);
        expect(VersionParser.compare('1.10.0', '1.2.0')).toBe(1);
        expect(VersionParser.compare('1.1.9', '1.2.0')).toBe(-1);
      });

      it('should compare patch version differences', () => {
        expect(VersionParser.compare('1.0.1', '1.0.2')).toBe(-1);
        expect(VersionParser.compare('1.0.10', '1.0.2')).toBe(1);
        expect(VersionParser.compare('1.0.1', '1.0.1')).toBe(0);
      });
    });

    describe('pre-release version comparison', () => {
      it('should compare pre-release versions alphabetically', () => {
        expect(VersionParser.compare('1.0.0-alpha', '1.0.0-beta')).toBe(-1);
        expect(VersionParser.compare('1.0.0-beta', '1.0.0-alpha')).toBe(1);
        expect(VersionParser.compare('1.0.0-alpha', '1.0.0-alpha')).toBe(0);
      });

      it('should treat pre-release as lower than release', () => {
        expect(VersionParser.compare('1.0.0-alpha', '1.0.0')).toBe(-1);
        expect(VersionParser.compare('1.0.0-beta', '1.0.0')).toBe(-1);
        expect(VersionParser.compare('1.0.0-rc.1', '1.0.0')).toBe(-1);
        expect(VersionParser.compare('1.0.0', '1.0.0-alpha')).toBe(1);
      });

      it('should compare pre-release with numeric identifiers', () => {
        expect(VersionParser.compare('1.0.0-alpha.1', '1.0.0-alpha.2')).toBe(-1);
        expect(VersionParser.compare('1.0.0-alpha.10', '1.0.0-alpha.2')).toBe(1);
        expect(VersionParser.compare('1.0.0-alpha.1', '1.0.0-alpha.1')).toBe(0);
      });

      it('should compare pre-release with multiple identifiers', () => {
        expect(VersionParser.compare('1.0.0-alpha.1', '1.0.0-alpha.1.1')).toBe(-1);
        expect(VersionParser.compare('1.0.0-alpha.beta', '1.0.0-alpha.beta.1')).toBe(-1);
        expect(VersionParser.compare('1.0.0-rc.1', '1.0.0-rc.2')).toBe(-1);
      });

      it('should compare common pre-release naming conventions', () => {
        // Common progression: alpha < beta < rc < release
        expect(VersionParser.compare('1.0.0-alpha.1', '1.0.0-beta.1')).toBe(-1);
        expect(VersionParser.compare('1.0.0-beta.1', '1.0.0-rc.1')).toBe(-1);
        expect(VersionParser.compare('1.0.0-rc.1', '1.0.0')).toBe(-1);
      });

      it('should handle snapshot and dev versions', () => {
        expect(VersionParser.compare('1.0.0-SNAPSHOT', '1.0.0')).toBe(-1);
        expect(VersionParser.compare('1.0.0-dev', '1.0.0')).toBe(-1);
        expect(VersionParser.compare('1.0.0-dev', '1.0.0-alpha')).toBe(1); // 'd' > 'a'
      });
    });

    describe('build metadata comparison', () => {
      it('should ignore build metadata in comparison', () => {
        // According to semver spec, build metadata SHOULD be ignored when determining version precedence
        expect(VersionParser.compare('1.0.0+build.1', '1.0.0+build.2')).toBe(0);
        expect(VersionParser.compare('1.0.0+build.123', '1.0.0+build.456')).toBe(0);
        expect(VersionParser.compare('1.0.0+20230101', '1.0.0+20230102')).toBe(0);
      });

      it('should compare versions with build metadata correctly', () => {
        expect(VersionParser.compare('1.0.0+build', '1.0.1+build')).toBe(-1);
        expect(VersionParser.compare('1.0.1+build', '1.0.0+build')).toBe(1);
      });

      it('should handle pre-release with build metadata', () => {
        expect(VersionParser.compare('1.0.0-alpha+build.1', '1.0.0-alpha+build.2')).toBe(0);
        expect(VersionParser.compare('1.0.0-alpha+build', '1.0.0-beta+build')).toBe(-1);
        expect(VersionParser.compare('1.0.0-alpha+build', '1.0.0+build')).toBe(-1);
      });
    });

    describe('complex version comparison', () => {
      it('should compare versions with both pre-release and build metadata', () => {
        expect(VersionParser.compare('1.0.0-beta.2+build.456', '1.0.0-beta.2+build.789')).toBe(0);
        expect(VersionParser.compare('1.0.0-beta.2+build.456', '1.0.0-beta.3+build.123')).toBe(-1);
        expect(VersionParser.compare('1.0.0-beta.2+build.456', '1.0.0+build.123')).toBe(-1);
      });

      it('should handle versions with leading v prefix', () => {
        expect(VersionParser.compare('v1.0.0', 'v2.0.0')).toBe(-1);
        expect(VersionParser.compare('v1.0.0', '1.0.0')).toBe(0);
      });

      it('should compare versions with large numbers', () => {
        expect(VersionParser.compare('100.200.300', '100.200.301')).toBe(-1);
        expect(VersionParser.compare('999.999.999', '1000.0.0')).toBe(-1);
      });
    });

    describe('edge cases and error handling', () => {
      it('should return null for invalid versions', () => {
        expect(VersionParser.compare('invalid', '1.0.0')).toBeNull();
        expect(VersionParser.compare('1.0.0', 'invalid')).toBeNull();
        expect(VersionParser.compare('invalid', 'also-invalid')).toBeNull();
      });

      it('should return null for malformed versions', () => {
        expect(VersionParser.compare('1.2', '1.2.3')).toBeNull();
        expect(VersionParser.compare('1', '1.0.0')).toBeNull();
        expect(VersionParser.compare('1.0.0', '1.2')).toBeNull();
      });

      it('should handle empty strings', () => {
        expect(VersionParser.compare('', '1.0.0')).toBeNull();
        expect(VersionParser.compare('1.0.0', '')).toBeNull();
      });
    });

    describe('real-world Helm chart version scenarios', () => {
      it('should compare typical Helm chart versions', () => {
        // Bitnami nginx chart versions
        expect(VersionParser.compare('15.9.0', '15.10.0')).toBe(-1);
        expect(VersionParser.compare('15.9.0', '16.0.0')).toBe(-1);
        expect(VersionParser.compare('15.9.0', '15.9.1')).toBe(-1);
      });

      it('should handle chart versions with pre-release tags', () => {
        expect(VersionParser.compare('1.0.0-rc.1', '1.0.0-rc.2')).toBe(-1);
        expect(VersionParser.compare('1.0.0-rc.2', '1.0.0')).toBe(-1);
      });

      it('should compare versions across major boundaries', () => {
        expect(VersionParser.compare('0.9.9', '1.0.0')).toBe(-1);
        expect(VersionParser.compare('1.99.99', '2.0.0')).toBe(-1);
      });
    });
  });

  describe('sort', () => {
    describe('basic sorting', () => {
      it('should sort versions in ascending order', () => {
        const versions = ['2.0.0', '1.0.0', '1.2.0', '1.1.0'];
        const sorted = VersionParser.sort(versions);
        
        expect(sorted).toEqual(['1.0.0', '1.1.0', '1.2.0', '2.0.0']);
      });

      it('should filter out invalid versions', () => {
        const versions = ['2.0.0', 'invalid', '1.0.0', 'not-a-version'];
        const sorted = VersionParser.sort(versions);
        
        expect(sorted).toEqual(['1.0.0', '2.0.0']);
      });

      it('should handle empty array', () => {
        const sorted = VersionParser.sort([]);
        
        expect(sorted).toEqual([]);
      });

      it('should handle single version', () => {
        const sorted = VersionParser.sort(['1.0.0']);
        
        expect(sorted).toEqual(['1.0.0']);
      });
    });

    describe('sorting with pre-release versions', () => {
      it('should sort versions with pre-release tags', () => {
        const versions = ['1.0.0', '1.0.0-beta', '1.0.0-alpha'];
        const sorted = VersionParser.sort(versions);
        
        expect(sorted).toEqual(['1.0.0-alpha', '1.0.0-beta', '1.0.0']);
      });

      it('should sort pre-release versions with numeric identifiers', () => {
        const versions = ['1.0.0-alpha.10', '1.0.0-alpha.2', '1.0.0-alpha.1'];
        const sorted = VersionParser.sort(versions);
        
        expect(sorted).toEqual(['1.0.0-alpha.1', '1.0.0-alpha.2', '1.0.0-alpha.10']);
      });

      it('should sort mixed release and pre-release versions', () => {
        const versions = [
          '2.0.0',
          '1.0.0-rc.1',
          '1.0.0',
          '1.0.0-beta',
          '1.0.0-alpha',
          '1.1.0'
        ];
        const sorted = VersionParser.sort(versions);
        
        expect(sorted).toEqual([
          '1.0.0-alpha',
          '1.0.0-beta',
          '1.0.0-rc.1',
          '1.0.0',
          '1.1.0',
          '2.0.0'
        ]);
      });

      it('should sort complete release cycle', () => {
        const versions = [
          '1.0.0',
          '1.0.0-rc.2',
          '1.0.0-beta.2',
          '1.0.0-alpha.1',
          '1.0.0-rc.1',
          '1.0.0-beta.1',
          '1.0.0-alpha.2'
        ];
        const sorted = VersionParser.sort(versions);
        
        expect(sorted).toEqual([
          '1.0.0-alpha.1',
          '1.0.0-alpha.2',
          '1.0.0-beta.1',
          '1.0.0-beta.2',
          '1.0.0-rc.1',
          '1.0.0-rc.2',
          '1.0.0'
        ]);
      });
    });

    describe('sorting with build metadata', () => {
      it('should sort versions with build metadata', () => {
        const versions = ['1.0.0+build.2', '1.0.0+build.1', '1.0.0'];
        const sorted = VersionParser.sort(versions);
        
        // Build metadata should be ignored for sorting, but versions should still be present
        // All three versions are considered equal, so order may vary but all should be present
        expect(sorted).toHaveLength(3);
        expect(sorted).toContain('1.0.0');
        expect(sorted).toContain('1.0.0+build.1');
        expect(sorted).toContain('1.0.0+build.2');
      });

      it('should sort versions with pre-release and build metadata', () => {
        const versions = [
          '1.0.0+build',
          '1.0.0-beta+build',
          '1.0.0-alpha+build'
        ];
        const sorted = VersionParser.sort(versions);
        
        expect(sorted).toEqual([
          '1.0.0-alpha+build',
          '1.0.0-beta+build',
          '1.0.0+build'
        ]);
      });
    });

    describe('sorting complex version lists', () => {
      it('should sort typical Helm chart version list', () => {
        const versions = [
          '16.0.0',
          '15.10.0',
          '15.9.1',
          '15.9.0',
          '15.8.0',
          '14.0.0'
        ];
        const sorted = VersionParser.sort(versions);
        
        expect(sorted).toEqual([
          '14.0.0',
          '15.8.0',
          '15.9.0',
          '15.9.1',
          '15.10.0',
          '16.0.0'
        ]);
      });

      it('should sort versions with large numbers', () => {
        const versions = ['100.0.0', '10.0.0', '1.0.0', '99.0.0'];
        const sorted = VersionParser.sort(versions);
        
        expect(sorted).toEqual(['1.0.0', '10.0.0', '99.0.0', '100.0.0']);
      });

      it('should handle versions with leading v', () => {
        const versions = ['v2.0.0', 'v1.0.0', 'v1.5.0'];
        const sorted = VersionParser.sort(versions);
        
        expect(sorted).toEqual(['v1.0.0', 'v1.5.0', 'v2.0.0']);
      });
    });

    describe('edge cases', () => {
      it('should handle all invalid versions', () => {
        const versions = ['invalid', 'not-a-version', 'bad'];
        const sorted = VersionParser.sort(versions);
        
        expect(sorted).toEqual([]);
      });

      it('should handle duplicate versions', () => {
        const versions = ['1.0.0', '1.0.0', '2.0.0', '1.0.0'];
        const sorted = VersionParser.sort(versions);
        
        expect(sorted).toEqual(['1.0.0', '1.0.0', '1.0.0', '2.0.0']);
      });

      it('should not mutate original array', () => {
        const versions = ['2.0.0', '1.0.0'];
        const original = [...versions];
        VersionParser.sort(versions);
        
        expect(versions).toEqual(original);
      });
    });
  });

  describe('sortDescending', () => {
    describe('basic sorting', () => {
      it('should sort versions in descending order', () => {
        const versions = ['1.0.0', '2.0.0', '1.1.0', '1.2.0'];
        const sorted = VersionParser.sortDescending(versions);
        
        expect(sorted).toEqual(['2.0.0', '1.2.0', '1.1.0', '1.0.0']);
      });

      it('should filter out invalid versions', () => {
        const versions = ['2.0.0', 'invalid', '1.0.0', 'not-a-version'];
        const sorted = VersionParser.sortDescending(versions);
        
        expect(sorted).toEqual(['2.0.0', '1.0.0']);
      });

      it('should handle empty array', () => {
        const sorted = VersionParser.sortDescending([]);
        
        expect(sorted).toEqual([]);
      });

      it('should handle single version', () => {
        const sorted = VersionParser.sortDescending(['1.0.0']);
        
        expect(sorted).toEqual(['1.0.0']);
      });
    });

    describe('sorting with pre-release versions', () => {
      it('should sort pre-release versions in descending order', () => {
        const versions = ['1.0.0-alpha', '1.0.0-beta', '1.0.0'];
        const sorted = VersionParser.sortDescending(versions);
        
        expect(sorted).toEqual(['1.0.0', '1.0.0-beta', '1.0.0-alpha']);
      });

      it('should sort mixed release and pre-release versions', () => {
        const versions = [
          '1.0.0-alpha',
          '1.0.0',
          '1.0.0-beta',
          '1.1.0',
          '2.0.0',
          '1.0.0-rc.1'
        ];
        const sorted = VersionParser.sortDescending(versions);
        
        expect(sorted).toEqual([
          '2.0.0',
          '1.1.0',
          '1.0.0',
          '1.0.0-rc.1',
          '1.0.0-beta',
          '1.0.0-alpha'
        ]);
      });

      it('should sort pre-release with numeric identifiers', () => {
        const versions = ['1.0.0-alpha.1', '1.0.0-alpha.2', '1.0.0-alpha.10'];
        const sorted = VersionParser.sortDescending(versions);
        
        expect(sorted).toEqual(['1.0.0-alpha.10', '1.0.0-alpha.2', '1.0.0-alpha.1']);
      });
    });

    describe('sorting with build metadata', () => {
      it('should sort versions with build metadata in descending order', () => {
        const versions = ['1.0.0', '1.0.0+build.1', '1.0.0+build.2'];
        const sorted = VersionParser.sortDescending(versions);
        
        // Build metadata should be ignored for sorting, all are considered equal
        // All three versions should be present
        expect(sorted).toHaveLength(3);
        expect(sorted).toContain('1.0.0');
        expect(sorted).toContain('1.0.0+build.1');
        expect(sorted).toContain('1.0.0+build.2');
      });

      it('should sort versions with pre-release and build metadata', () => {
        const versions = [
          '1.0.0-alpha+build',
          '1.0.0-beta+build',
          '1.0.0+build'
        ];
        const sorted = VersionParser.sortDescending(versions);
        
        expect(sorted).toEqual([
          '1.0.0+build',
          '1.0.0-beta+build',
          '1.0.0-alpha+build'
        ]);
      });
    });

    describe('real-world scenarios', () => {
      it('should sort typical Helm chart versions for finding latest', () => {
        const versions = [
          '14.0.0',
          '15.8.0',
          '15.9.0',
          '15.9.1',
          '15.10.0',
          '16.0.0'
        ];
        const sorted = VersionParser.sortDescending(versions);
        
        expect(sorted).toEqual([
          '16.0.0',
          '15.10.0',
          '15.9.1',
          '15.9.0',
          '15.8.0',
          '14.0.0'
        ]);
        
        // First element should be the latest version
        expect(sorted[0]).toBe('16.0.0');
      });

      it('should sort versions with pre-release candidates', () => {
        const versions = [
          '2.0.0-rc.1',
          '2.0.0-rc.2',
          '2.0.0',
          '1.9.9',
          '2.0.0-beta.1'
        ];
        const sorted = VersionParser.sortDescending(versions);
        
        expect(sorted).toEqual([
          '2.0.0',
          '2.0.0-rc.2',
          '2.0.0-rc.1',
          '2.0.0-beta.1',
          '1.9.9'
        ]);
      });

      it('should handle versions with leading v', () => {
        const versions = ['v1.0.0', 'v1.5.0', 'v2.0.0'];
        const sorted = VersionParser.sortDescending(versions);
        
        expect(sorted).toEqual(['v2.0.0', 'v1.5.0', 'v1.0.0']);
      });
    });

    describe('edge cases', () => {
      it('should handle all invalid versions', () => {
        const versions = ['invalid', 'not-a-version', 'bad'];
        const sorted = VersionParser.sortDescending(versions);
        
        expect(sorted).toEqual([]);
      });

      it('should handle duplicate versions', () => {
        const versions = ['1.0.0', '2.0.0', '1.0.0', '1.0.0'];
        const sorted = VersionParser.sortDescending(versions);
        
        expect(sorted).toEqual(['2.0.0', '1.0.0', '1.0.0', '1.0.0']);
      });

      it('should not mutate original array', () => {
        const versions = ['1.0.0', '2.0.0'];
        const original = [...versions];
        VersionParser.sortDescending(versions);
        
        expect(versions).toEqual(original);
      });

      it('should handle versions with large numbers', () => {
        const versions = ['1.0.0', '10.0.0', '99.0.0', '100.0.0'];
        const sorted = VersionParser.sortDescending(versions);
        
        expect(sorted).toEqual(['100.0.0', '99.0.0', '10.0.0', '1.0.0']);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle version with leading v', () => {
      // Note: semver library handles 'v' prefix automatically
      const result = VersionParser.parse('v1.2.3');
      
      expect(result.isValid).toBe(true);
    });

    it('should handle version with many digits', () => {
      const result = VersionParser.parse('123.456.789');
      
      expect(result.isValid).toBe(true);
      expect(result.type).toBe('exact');
    });

    it('should handle complex pre-release identifiers', () => {
      const result = VersionParser.parse('1.0.0-alpha.beta.gamma.1');
      
      expect(result.isValid).toBe(true);
    });

    it('should handle version 0.0.0', () => {
      const result = VersionParser.parse('0.0.0');
      
      expect(result.isValid).toBe(true);
      expect(result.type).toBe('exact');
    });
  });
});
